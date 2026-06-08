"use server";

import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import {
  kudosInputSchema,
  type KudosInput,
  isChallengeOver,
  type ChallengeStatus,
} from "@withkey/domain";
import { decryptAccountNumber } from "@/lib/crypto/account-cipher";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dispatchKudosReceivedNotification, dispatchStartNotification } from "@/lib/push/dispatch";

type KudosResult = { toggled: "added" | "removed" };

// BE_SCHEMA §8.6. UNIQUE (action_log_id, user_id, emoji) 로 토글.
// plan 2026-05-22-kudos-received-notification — INSERT 분기 후 작성자에게 push 발송 (after() 로 fire).
export const toggleKudos = withUser<KudosInput, KudosResult>(
  async (user, input): Promise<ActionResult<KudosResult>> => {
    const parsed = kudosInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    const supabase = await createClient();

    // 종료/만기 도달 챌린지의 kudos 토글 차단 — 클라이언트 disabled 우회 방어.
    // action_log → challenge 조인으로 status / end_at 검사. RLS 가 비멤버 접근 자동 차단.
    // Phase 3 (plan v4): challenge_id 의 path-level revalidatePath 사용 안 함 — tag 기반 invalidation.
    const { data: logForGuard } = await supabase
      .from("action_logs")
      .select("challenges!inner(status, end_at)")
      .eq("id", parsed.data.actionLogId)
      .maybeSingle();
    if (!logForGuard) return failure("not_found");
    const ch = Array.isArray(logForGuard.challenges)
      ? logForGuard.challenges[0]
      : logForGuard.challenges;
    if (!ch) return failure("not_found");
    // ADR-0027 — 종료 판정 canonical 헬퍼. closed 또는 만기(active + end_at <= now) → 차단.
    const endAt = ch.end_at as string | null;
    if (isChallengeOver(ch.status as ChallengeStatus, endAt)) return failure("forbidden");

    const { data: existing } = await supabase
      .from("kudos")
      .select("id")
      .eq("action_log_id", parsed.data.actionLogId)
      .eq("user_id", user.id)
      .eq("emoji", parsed.data.emoji)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase.from("kudos").delete().eq("id", existing.id);
      if (error) return failure(mapSupabaseError(error));
      // Phase 3 (SNS cache plan v4) — 정확한 tag 무효화로 flicker 차단:
      // - updateTag('user-${uid}-kudos-${alid}') — 본인 viewer state 즉시 invalidate (read-your-writes)
      // - updateTag('kudos-counts-${alid}') — 본인 counts 즉시 invalidate
      // - revalidateTag('kudos-counts-${alid}', 'max') — 타인의 다음 fetch SWR fresh
      updateTag(`user-${user.id}-kudos-${parsed.data.actionLogId}`);
      updateTag(`kudos-counts-${parsed.data.actionLogId}`);
      revalidateTag(`kudos-counts-${parsed.data.actionLogId}`, "max");
      return success({ toggled: "removed" });
    }

    const { error } = await supabase.from("kudos").insert({
      action_log_id: parsed.data.actionLogId,
      user_id: user.id,
      emoji: parsed.data.emoji,
    });
    if (error) return failure(mapSupabaseError(error));
    // Phase 3 — 위 DELETE 분기와 동일 패턴 (read-your-writes + 타인 SWR).
    updateTag(`user-${user.id}-kudos-${parsed.data.actionLogId}`);
    updateTag(`kudos-counts-${parsed.data.actionLogId}`);
    revalidateTag(`kudos-counts-${parsed.data.actionLogId}`, "max");

    void track(
      {
        name: "kudos_given",
        props: { actionLogId: parsed.data.actionLogId, emoji: parsed.data.emoji },
      },
      { userId: user.id },
    );

    // INSERT 성공 후 recipient (action_log 작성자) 에게 push 발송.
    // recipient/challenge lookup 은 일반 supabase client 로 충분 — kudos INSERT 성공이 곧
    // actor 가 같은 그룹 멤버임을 보장 (kudos_insert_self_not_own → al_select_member 통과).
    // actor display_name 도 본인 row 라 users_select_self_or_group 정책 통과.
    const [{ data: log }, { data: profile }] = await Promise.all([
      supabase
        .from("action_logs")
        .select("user_id, challenge_id")
        .eq("id", parsed.data.actionLogId)
        .maybeSingle(),
      supabase.from("users").select("display_name").eq("id", user.id).maybeSingle(),
    ]);

    if (log && log.user_id && log.challenge_id) {
      const recipientUserId = log.user_id as string;
      const challengeId = log.challenge_id as string;
      const actorDisplayName = profile?.display_name?.trim() || "친구";
      // after() — Vercel waitUntil 보장으로 응답 후에도 promise 완주 (ADR-0017 H3).
      // 응답 latency 에 push 발송이 더해지지 않도록 fire-and-forget.
      after(() =>
        dispatchKudosReceivedNotification({
          recipientUserId,
          actorUserId: user.id,
          actorDisplayName,
          actionLogId: parsed.data.actionLogId,
          challengeId,
          emoji: parsed.data.emoji,
        }).catch((e) => {
          console.error("[toggleKudos] kudos dispatch failed", e);
        }),
      );
    }

    return success({ toggled: "added" });
  },
);

// PRD §9.1 — 사용자가 인증 화면(/challenge/[id]/action)에 진입하면 action_started 분석 이벤트 발사.
// 푸시는 더 이상 여기서 보내지 않는다(제출 완료 시 dispatchActionCompletedNotification 로 이동).
// events 테이블 idempotency 로 1일 1회만 기록한다(분석 dedupe).
const startActionInputSchema = z.object({ challengeId: z.string().uuid() });
type StartActionInput = z.infer<typeof startActionInputSchema>;
type StartActionResult = { skipped: boolean };

export const markActionStarted = withUser<StartActionInput, StartActionResult>(
  async (user, input): Promise<ActionResult<StartActionResult>> => {
    const parsed = startActionInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    const supabase = await createClient();

    const { data: membership, error: mErr } = await supabase
      .from("challenge_participants")
      .select("user_id, challenges!inner(status, start_at, end_at)")
      .eq("challenge_id", parsed.data.challengeId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (mErr) return failure(mapSupabaseError(mErr));
    if (!membership) return failure("not_found");
    const ch = Array.isArray(membership.challenges)
      ? membership.challenges[0]
      : membership.challenges;
    if (!ch || ch.status !== "active") return failure("forbidden");
    const now = Date.now();
    if (
      !ch.start_at ||
      !ch.end_at ||
      now < new Date(ch.start_at).getTime() ||
      now > new Date(ch.end_at).getTime()
    ) {
      return failure("forbidden");
    }

    // events 테이블은 service_role 만 SELECT — admin 클라이언트로 idempotency 조회.
    const admin = adminClient();
    const { data: existing } = await admin
      .from("events")
      .select("id")
      .eq("name", "action_started")
      .eq("user_id", user.id)
      .contains("props", { challengeId: parsed.data.challengeId })
      .gte("created_at", startOfKstTodayIso())
      .limit(1);
    if (existing && existing.length > 0) {
      return success({ skipped: true });
    }

    void track(
      { name: "action_started", props: { challengeId: parsed.data.challengeId } },
      { userId: user.id },
    );

    return success({ skipped: false });
  },
);

function startOfKstTodayIso(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  const yyyy = kst.getUTCFullYear();
  const mm = kst.getUTCMonth();
  const dd = kst.getUTCDate();
  return new Date(Date.UTC(yyyy, mm, dd) - 9 * 3_600_000).toISOString();
}

// D-016: 그룹 오너가 등록한 계좌번호 평문을 복사 버튼에 제공.
// 암호문 SELECT 는 이 함수 한 경로만 — RLS(`groups_select_member`)가 비멤버 차단.
const revealInputSchema = z.object({ groupId: z.string().uuid() });
type RevealInput = z.infer<typeof revealInputSchema>;

export const revealAccountNumber = withUser<RevealInput, { accountNumber: string }>(
  async (user, input): Promise<ActionResult<{ accountNumber: string }>> => {
    const parsed = revealInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("groups")
      .select("account_number_encrypted")
      .eq("id", parsed.data.groupId)
      .maybeSingle();

    if (error) {
      console.error("[revealAccountNumber] select failed", {
        groupId: parsed.data.groupId,
        error,
      });
      return failure("upstream_error");
    }
    // RLS 로 필터링됐거나 계좌 미등록.
    if (!data || !data.account_number_encrypted) {
      return failure("not_found");
    }

    let plaintext: string;
    try {
      const buf = bytesFromSupabase(data.account_number_encrypted);
      plaintext = decryptAccountNumber(buf);
    } catch (err) {
      // 평문/암호문은 로그에 절대 싣지 않음. 원인 클래스만.
      console.error("[revealAccountNumber] decrypt failed", {
        groupId: parsed.data.groupId,
        errorName: err instanceof Error ? err.name : "unknown",
      });
      return failure("upstream_error");
    }

    void track(
      { name: "account_copied", props: { groupId: parsed.data.groupId } },
      { userId: user.id },
    );

    return success({ accountNumber: plaintext });
  },
);

// supabase-js 는 bytea 를 '\x..' hex escape 문자열로 반환. Uint8Array 케이스도 수용.
function bytesFromSupabase(raw: unknown): Buffer {
  if (typeof raw === "string") {
    const hex = raw.startsWith("\\x") ? raw.slice(2) : raw;
    return Buffer.from(hex, "hex");
  }
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  throw new Error("unexpected bytea shape");
}

// PRD §3.4 — 운영자가 진행 중 챌린지를 즉시 종료. RLS(`challenges_update_pending_owner`)
// 는 active→closed 갱신을 막으므로 admin client 로 owner 검증 후 status='closed' 직접 갱신.
const challengeIdInputSchema = z.object({ challengeId: z.string().uuid() });
type ChallengeIdInput = z.infer<typeof challengeIdInputSchema>;

async function assertChallengeOwner(challengeId: string, userId: string): Promise<boolean> {
  const admin = adminClient();
  const { data } = await admin
    .from("challenges")
    .select("id, groups!inner(owner_id)")
    .eq("id", challengeId)
    .maybeSingle();
  if (!data) return false;
  const group = Array.isArray(data.groups) ? data.groups[0] : data.groups;
  return group?.owner_id === userId;
}

export const endChallenge = withUser<ChallengeIdInput, { id: string }>(
  async (user, input): Promise<ActionResult<{ id: string }>> => {
    const parsed = challengeIdInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const ok = await assertChallengeOwner(parsed.data.challengeId, user.id);
    if (!ok) return failure("forbidden");

    const admin = adminClient();
    // ADR-0030 — 조기 종료 cutoff 산정용으로 종료 시각도 함께 기록.
    const { error } = await admin
      .from("challenges")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", parsed.data.challengeId);
    if (error) return failure(mapSupabaseError(error));
    // status 'active' → 'closed' 가 /home · /me/challenges · /challenge/[id] 등 광범위에 영향.
    // PR #77 createChallenge 패턴과 동일하게 (app) layout 전체 무효화.
    revalidatePath("/", "layout");
    return success({ id: parsed.data.challengeId });
  },
);

export const startChallengeWithSignedParticipants = withUser<
  ChallengeIdInput,
  { id: string; participantCount: number }
>(async (user, input): Promise<ActionResult<{ id: string; participantCount: number }>> => {
  const parsed = challengeIdInputSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_challenge_with_signed_participants", {
    p_challenge_id: parsed.data.challengeId,
  });
  if (error) return failure(mapSupabaseError(error));
  const row = data?.[0];
  if (!row || row.status !== "active") return failure("upstream_error");

  const participantCount = row.participant_count ?? 1;
  const signToActiveMs = row.challenge_created_at
    ? Math.max(0, Date.now() - new Date(row.challenge_created_at).getTime())
    : 0;

  void track(
    {
      name: "challenge_activated",
      props: {
        challengeId: parsed.data.challengeId,
        signToActiveMs,
        participantCount,
      },
    },
    { userId: user.id },
  );

  // after() — Vercel waitUntil 보장으로 응답 후에도 push dispatch 완주 (H3).
  // dispatch 내부에서 per-recipient outcome 을 기록한다. 시작 성공을 되돌리지 않음.
  after(() =>
    dispatchStartNotification(parsed.data.challengeId).catch((e) => {
      console.error("[startChallengeWithSignedParticipants] dispatch failed", e);
    }),
  );

  // status 'pending' → 'active' 가 /home RunningChallengeList · /challenge/[id] 의
  // StartChallengeCard 표시 여부 등 광범위에 영향. PR #77 패턴.
  revalidatePath("/", "layout");
  return success({ id: parsed.data.challengeId, participantCount });
});

// CASCADE 로 action_logs · kudos · challenge_participants 함께 삭제 (FK on delete cascade).
export const deleteChallenge = withUser<ChallengeIdInput, { id: string }>(
  async (user, input): Promise<ActionResult<{ id: string }>> => {
    const parsed = challengeIdInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const ok = await assertChallengeOwner(parsed.data.challengeId, user.id);
    if (!ok) return failure("forbidden");

    const admin = adminClient();
    const { error } = await admin.from("challenges").delete().eq("id", parsed.data.challengeId);
    if (error) return failure(mapSupabaseError(error));
    // CASCADE 로 자식 row 가 함께 사라지므로 home · 관리 · 그룹 화면 모두 stale 가능성.
    revalidatePath("/", "layout");
    return success({ id: parsed.data.challengeId });
  },
);

// PRD §3.4 — 참여자가 챌린지에서 빠지기. RLS 에 DELETE 정책 없음 → admin client 로
// 본인 row 만 삭제. action_logs/kudos 는 ON DELETE CASCADE 로 자동 정리.
export const leaveChallenge = withUser<ChallengeIdInput, { id: string }>(
  async (user, input): Promise<ActionResult<{ id: string }>> => {
    const parsed = challengeIdInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    const admin = adminClient();
    // 운영자는 leave 대신 deleteChallenge 를 써야 한다 (그룹·챌린지 일관성).
    const { data: ch } = await admin
      .from("challenges")
      .select("groups!inner(owner_id)")
      .eq("id", parsed.data.challengeId)
      .maybeSingle();
    const g = Array.isArray(ch?.groups) ? ch.groups[0] : ch?.groups;
    if (g?.owner_id === user.id) return failure("forbidden");

    const { error } = await admin
      .from("challenge_participants")
      .delete()
      .eq("challenge_id", parsed.data.challengeId)
      .eq("user_id", user.id);
    if (error) return failure(mapSupabaseError(error));
    // 본인 참여 제거가 /home · /me/challenges 의 "참여 중" 리스트에 즉시 반영되도록.
    // Phase 5-2: 본인 my-challenges + home-feed tag 즉시 invalidate.
    updateTag(`user-${user.id}-my-challenges`);
    updateTag(`user-${user.id}-home-feed`);
    revalidatePath("/", "layout");
    return success({ id: parsed.data.challengeId });
  },
);

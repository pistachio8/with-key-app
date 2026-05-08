"use server";

import { z } from "zod";
import { kudosInputSchema, type KudosInput } from "@/lib/validators/kudos";
import { decryptAccountNumber } from "@/lib/crypto/account-cipher";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dispatchActionStartNotification } from "@/lib/push/dispatch";
import { isQuietHoursKST } from "@/lib/push/send";

type KudosResult = { toggled: "added" | "removed" };

// BE_SCHEMA §8.6. UNIQUE (action_log_id, user_id, emoji) 로 토글.
export const toggleKudos = withUser<KudosInput, KudosResult>(
  async (user, input): Promise<ActionResult<KudosResult>> => {
    const parsed = kudosInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    const supabase = await createClient();

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
      return success({ toggled: "removed" });
    }

    const { error } = await supabase.from("kudos").insert({
      action_log_id: parsed.data.actionLogId,
      user_id: user.id,
      emoji: parsed.data.emoji,
    });
    if (error) return failure(mapSupabaseError(error));

    void track(
      {
        name: "kudos_given",
        props: { actionLogId: parsed.data.actionLogId, emoji: parsed.data.emoji },
      },
      { userId: user.id },
    );

    return success({ toggled: "added" });
  },
);

// PRD §6.2/6.3 — 사용자가 "운동 시작" 탭 → 그룹원에게 푸시. AC-2 1일 1회 (events 기반 idempotency).
const startActionInputSchema = z.object({ challengeId: z.string().uuid() });
type StartActionInput = z.infer<typeof startActionInputSchema>;
// 클라이언트가 정직한 토스트를 띄울 수 있도록 발송 결과를 그대로 전달한다.
// `skipped` 는 1일 1회 idempotency, `quietHours` 는 KST 02-07 발송 보류, `recipientCount` 는 실제 발송 후보 수.
type StartActionResult = {
  skipped: boolean;
  quietHours: boolean;
  recipientCount: number;
};

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
      return success({ skipped: true, quietHours: false, recipientCount: 0 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    const displayName = profile?.display_name?.trim() || "친구";

    void track(
      { name: "action_started", props: { challengeId: parsed.data.challengeId } },
      { userId: user.id },
    );

    // 토스트가 거짓말하지 않도록 dispatch 를 await 해 실제 발송 요약을 얻는다.
    // 송신은 dispatch 내부에서 Promise.allSettled 로 병렬화되어 그룹 N=3~4 에서 지연 누적 없음.
    let summary = { recipientCount: 0, quietHours: isQuietHoursKST() };
    try {
      summary = await dispatchActionStartNotification(parsed.data.challengeId, {
        userId: user.id,
        displayName,
      });
    } catch (error) {
      console.error("[markActionStarted] dispatch failed", error);
    }

    return success({
      skipped: false,
      quietHours: summary.quietHours,
      recipientCount: summary.recipientCount,
    });
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

// 챌린지 lifecycle mutation service (EVAL-0018 · 00 §13.2 #4·#10·#14 — RPC direct).
// 권한 검증(owner/participant)·상태 전이 규칙(pending freeze·active cohort)은
// SECURITY DEFINER RPC(0021/0022 create_challenge · 0040 sign_and_maybe_activate ·
// 0039 start_challenge_with_signed_participants)가 단독 담당 — 클라이언트는
// zod 입력 검증(@withkey/domain SoT) + 에러 코드 매핑 + 결과 정규화만 한다.
// push(시작 알림·owner start nudge)와 analytics(challenge_created 등 PRD §9.1)는
// service-role 이 필요한 server/BFF 경로(00 §13.4 D-2·D-3) — mobile 은 발사하지 않는다.
import { challengeInputSchema, challengeSchema, type ChallengeStatus } from "@withkey/domain";

import { getSupabaseClient } from "@/services/supabase/client";

import { fetchOwnerGroupsForChallengeForm } from "./challenge-reads";

// zod SoT 재사용 — mobile 은 zod 를 직접 의존하지 않는다 (challenge/[id]/_layout 패턴).
const uuidSchema = challengeSchema.shape.id;

export type LifecycleErrorCode =
  // 입력이 zod 검증(제목 1~30·빈도 1~7·기간 7~90·벌금 0~10,000/1,000원 단위)에 실패
  | "invalid_input"
  // owner 그룹이 2개 이상인데 groupId 미지정 (web createChallenge 와 동일 분기)
  | "group_selection_required"
  // 42501 — RLS/RPC 권한 거부 (비owner 생성·비참가자 서명·비owner 시작·미인증)
  | "forbidden"
  // P0002 — 대상 없음 (그룹/챌린지)
  | "not_found"
  // 23505 — 그룹당 open 챌린지 1개 제약 위반 (0029 partial unique index)
  | "conflict"
  | "mutation_failed";

type PgErrorLike = { code?: string | null; message?: string | null };

// web mapSupabaseError 와 동일 의미 매핑 (apps/web/src/lib/actions/supabase-error.ts).
function mapPgError(error: PgErrorLike): LifecycleErrorCode {
  switch (error.code) {
    case "42501":
      return "forbidden";
    case "P0002":
    case "PGRST116":
      return "not_found";
    case "23505":
      return "conflict";
    case "23502":
    case "23503":
    case "23514":
      return "invalid_input";
    default:
      return "mutation_failed";
  }
}

export type CreateChallengeInput = {
  /** 미지정 시 owner 그룹 수로 자동 매칭 — 1개면 그 그룹, 0개면 신규 생성 (ADR-0012). */
  groupId?: string;
  title: string;
  type: "fitness";
  goalCount: number;
  durationDays: number;
  penaltyAmount: number;
  /** web ownerSignatureDataUrl 등가 — true 면 생성 직후 운영자 자가 서명 RPC 호출. */
  ownerSigned: boolean;
};

export type CreateChallengeResult =
  | { ok: true; challengeId: string; groupId: string; participantCount: number }
  | { ok: false; error: LifecycleErrorCode };

const DEFAULT_GROUP_SUFFIX = "님과 친구들";
const MAX_GROUP_NAME_LENGTH = 30;

// web defaultGroupBaseName 패리티 (apps/web/src/lib/groups/default-name.ts).
function defaultGroupBaseName(displayName: string | null): string {
  const base = `${displayName?.trim() || "내"}${DEFAULT_GROUP_SUFFIX}`;
  return base.slice(0, MAX_GROUP_NAME_LENGTH);
}

/**
 * 챌린지 생성 — web (flow)/challenge/new/_actions.ts createChallenge 의 RPC 코어 패리티.
 * 그룹 resolve(ADR-0012) → create_challenge RPC(challenges + participants 시드, 0021)
 * → 운영자 자가 서명(sign_and_maybe_activate). invite 토큰 발급은 별도 단계
 * (features/invite createInvite — 00 §13.2 #18 RN direct)로 호출자가 잇는다.
 */
export async function createChallenge(
  userId: string,
  input: CreateChallengeInput,
): Promise<CreateChallengeResult> {
  const { groupId: maybeGroupId, ownerSigned, ...challengeFields } = input;
  const parsed = challengeInputSchema.safeParse(challengeFields);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  if (maybeGroupId !== undefined && !uuidSchema.safeParse(maybeGroupId).success) {
    return { ok: false, error: "invalid_input" };
  }

  const supabase = getSupabaseClient();

  // 1) 그룹 — 미제공 시 owner 그룹 수로 persistent crew 매칭 (web 과 동일 분기).
  let groupId = maybeGroupId;
  if (!groupId) {
    let ownerGroups: Awaited<ReturnType<typeof fetchOwnerGroupsForChallengeForm>>;
    try {
      ownerGroups = await fetchOwnerGroupsForChallengeForm(userId);
    } catch (error) {
      console.error("[createChallenge] owner groups read failed", error);
      return { ok: false, error: "mutation_failed" };
    }

    if (ownerGroups.length === 1) {
      groupId = ownerGroups[0]!.id;
    } else if (ownerGroups.length >= 2) {
      return { ok: false, error: "group_selection_required" };
    } else {
      const { data: me } = await supabase
        .from("users")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();
      const displayName = (me?.display_name as string | null) ?? null;
      const { data: createdGroupId, error: groupErr } = await supabase.rpc(
        "create_group_with_owner",
        {
          p_name: defaultGroupBaseName(displayName),
          p_bank_code: null,
          p_account_holder: null,
          p_account_number_encrypted: null,
          p_account_number_last4: null,
        },
      );
      if (groupErr) {
        console.error("[createChallenge] create_group_with_owner failed", groupErr.code);
        return { ok: false, error: mapPgError(groupErr) };
      }
      if (typeof createdGroupId !== "string") return { ok: false, error: "mutation_failed" };
      groupId = createdGroupId;
    }
  }

  // 2) 챌린지 생성 — challenges insert + 전 group_members participants 시드 (한 트랜잭션).
  const { data: challengeRows, error: challengeErr } = await supabase.rpc("create_challenge", {
    p_group_id: groupId,
    p_title: parsed.data.title,
    p_type: parsed.data.type,
    p_goal_count: parsed.data.goalCount,
    p_duration_days: parsed.data.durationDays,
    p_penalty_amount: parsed.data.penaltyAmount,
  });
  if (challengeErr) {
    console.error("[createChallenge] create_challenge failed", challengeErr.code);
    return { ok: false, error: mapPgError(challengeErr) };
  }
  const challengeRow = (
    challengeRows as unknown as { id: string; participant_count: number }[]
  )?.[0];
  if (!challengeRow) return { ok: false, error: "mutation_failed" };

  // 3) 운영자 자가 서명 — web 과 동일하게 서명 실패는 실패로 보고한다
  //    (챌린지는 이미 생성됨 — 재시도 시 conflict 로 안내되고 서명은 pledge 화면에서 가능).
  if (ownerSigned) {
    const { error: signErr } = await supabase.rpc("sign_and_maybe_activate", {
      p_challenge_id: challengeRow.id,
    });
    if (signErr) {
      console.error("[createChallenge] owner self-sign failed", signErr.code);
      return { ok: false, error: mapPgError(signErr) };
    }
  }

  return {
    ok: true,
    challengeId: challengeRow.id,
    groupId,
    participantCount: challengeRow.participant_count,
  };
}

export type SignPledgeResult =
  | {
      ok: true;
      challengeId: string;
      status: ChallengeStatus;
      participantCount: number;
      signedCount: number;
    }
  | { ok: false; error: LifecycleErrorCode };

/**
 * 서약 서명 — sign_and_maybe_activate RPC(0040). 서명만 기록하고 자동 시작하지
 * 않는다(0028 pending freeze — 시작은 owner 의 명시 start). 이미 서명한 경우에도
 * RPC 가 timestamp 를 보존(coalesce)하고 성공으로 수렴한다 — 멱등.
 * should_nudge_owner(전원 서명 nudge push)는 server 전용 side-effect 라 무시한다(D-2).
 */
export async function signPledge(challengeId: string): Promise<SignPledgeResult> {
  if (!uuidSchema.safeParse(challengeId).success) return { ok: false, error: "invalid_input" };

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("sign_and_maybe_activate", {
    p_challenge_id: challengeId,
  });
  if (error) {
    console.error("[signPledge] sign_and_maybe_activate failed", error.code);
    return { ok: false, error: mapPgError(error) };
  }
  const row = (
    data as unknown as
      | { status: ChallengeStatus; participant_count: number; signed_count: number }[]
      | null
  )?.[0];
  if (!row) return { ok: false, error: "not_found" };

  return {
    ok: true,
    challengeId,
    status: row.status,
    participantCount: row.participant_count ?? 1,
    signedCount: row.signed_count ?? 1,
  };
}

export type StartChallengeResult =
  | {
      ok: true;
      challengeId: string;
      participantCount: number;
      startAt: string | null;
      endAt: string | null;
    }
  | { ok: false; error: LifecycleErrorCode };

/**
 * 서명한 멤버로 시작 — start_challenge_with_signed_participants RPC(0039).
 * owner-only + owner 서명 필수, 미서명 참가자는 cohort 에서 제외(freeze)되고
 * end_at 은 KST 자정 정렬(ADR-0026)로 RPC 가 계산한다. 시작 push 는 server 전용(D-2).
 */
export async function startChallengeWithSignedParticipants(
  challengeId: string,
): Promise<StartChallengeResult> {
  if (!uuidSchema.safeParse(challengeId).success) return { ok: false, error: "invalid_input" };

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("start_challenge_with_signed_participants", {
    p_challenge_id: challengeId,
  });
  if (error) {
    console.error("[startChallenge] rpc failed", error.code);
    return { ok: false, error: mapPgError(error) };
  }
  const row = (
    data as unknown as
      | {
          status: string;
          start_at: string | null;
          end_at: string | null;
          participant_count: number;
        }[]
      | null
  )?.[0];
  // active 전환이 확인되지 않으면 성공으로 보고하지 않는다 (web upstream_error 패리티).
  if (!row || row.status !== "active") return { ok: false, error: "mutation_failed" };

  return {
    ok: true,
    challengeId,
    participantCount: row.participant_count ?? 1,
    startAt: row.start_at,
    endAt: row.end_at,
  };
}

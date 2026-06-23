// src/lib/db/reads/recap.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  toKstDayKey,
  countDoneDaysByUserByWeek,
  confirmedPenalty,
  achievedAllElapsedWeeks,
  doneInElapsedWeeks,
  countAchievedWeeks,
  elapsedWeeks,
  pickMvpIds,
  type CutoffContext,
  type RecapGroupView,
  type RecapMemberView,
  type RecapView,
} from "@withkey/domain";

// view-model 계약 SoT 는 @withkey/domain read-contracts (EVAL-0016 · ADR-0037).
// 본 모듈은 추출 소스 — 기존 호출처 호환을 위해 re-export 유지.
export type { RecapGroupView, RecapMemberView, RecapView };

type ChallengeRow = {
  id: string;
  title: string;
  goal_count: number;
  duration_days: number;
  penalty_amount: number;
  status: "active" | "closed";
  start_at: string | null;
  end_at: string | null;
  closed_at: string | null;
};

type ParticipantRow = {
  user_id: string;
  display_name: string | null;
  doneByWeek: Map<number, number>;
};

export function buildRecapView(input: {
  challenge: ChallengeRow;
  participants: ReadonlyArray<ParticipantRow>;
  viewerId: string;
  now: Date;
  group?: RecapGroupView | null;
}): RecapView {
  const { challenge, participants, viewerId } = input;
  // recap 진입 조건은 isChallengeOver — closed 또는 active+만기(over). running 미진입.
  const phase = challenge.status === "closed" ? "closed" : "over";
  const startKey = challenge.start_at ? toKstDayKey(challenge.start_at) : "";
  const ctx: CutoffContext = {
    phase,
    durationDays: challenge.duration_days,
    todayDayIndex: 0, // over/closed 는 today 비의존
    closedAt: challenge.closed_at,
    startKey,
  };
  const params = { goalCount: challenge.goal_count, penaltyAmount: challenge.penalty_amount };

  const mvpIds = pickMvpIds(
    participants.map((p) => ({ id: p.user_id, doneByWeek: p.doneByWeek })),
    ctx,
    { goalCount: challenge.goal_count },
  );

  const members: RecapMemberView[] = participants.map((p) => ({
    id: p.user_id,
    displayName: p.display_name ?? "익명",
    doneCount: doneInElapsedWeeks(p.doneByWeek, ctx),
    achieved: achievedAllElapsedWeeks(p.doneByWeek, ctx, { goalCount: challenge.goal_count }),
    isMvp: mvpIds.includes(p.user_id),
  }));

  const viewerPart = participants.find((p) => p.user_id === viewerId);
  const viewerDoneByWeek = viewerPart?.doneByWeek ?? new Map<number, number>();

  return {
    challengeId: challenge.id,
    title: challenge.title,
    goalCount: challenge.goal_count,
    durationDays: challenge.duration_days,
    penaltyAmount: challenge.penalty_amount,
    startAt: challenge.start_at,
    endAt: challenge.end_at,
    status: challenge.status,
    viewerId,
    viewerAchieved: achievedAllElapsedWeeks(viewerDoneByWeek, ctx, {
      goalCount: challenge.goal_count,
    }),
    viewerDoneCount: doneInElapsedWeeks(viewerDoneByWeek, ctx),
    viewerPerHeadPenalty: confirmedPenalty(viewerDoneByWeek, ctx, params),
    viewerElapsedWeeks: elapsedWeeks(ctx).length,
    viewerAchievedWeeks: countAchievedWeeks(viewerDoneByWeek, ctx, {
      goalCount: challenge.goal_count,
    }),
    group: input.group ?? null,
    members,
    anyoneAchieved: members.some((m) => m.achieved),
  };
}

// 정산 recap 의 인증 집계 SoT — 인증 횟수(표시)·판정(달성/미달)·정산 금액이 모두 이 집합에서 파생된다.
// 🟨 과반 반려(action_logs.auto_verify_status='peer_rejected')는 done 으로 세지 않는다(ADR-0038 / EVAL-0041).
// 단일 제외 집합 — challenge-detail.ts 처럼 표시용/pot용을 분리하지 않는다.
// 왜: EVAL-0040 이 정산 penalty RPC(_settlement_confirmed_penalties)를 peer_rejected 제외로 바꿔,
// recap 도 같은 집합이어야 화면 penalty 가 실제 정산 RPC 와 일치한다(분리하면 어긋남).
export function buildVisibleDoneByUserByWeek(
  logs: ReadonlyArray<{ user_id: string; created_at: string; auto_verify_status: string }>,
  startKey: string | null,
  durationDays: number,
): Map<string, Map<number, number>> {
  if (!startKey) return new Map<string, Map<number, number>>();
  const visible = logs.filter((l) => l.auto_verify_status !== "peer_rejected");
  return countDoneDaysByUserByWeek(visible, startKey, durationDays);
}

type Options = { client?: SupabaseClient; now?: Date; challengeId?: string };

/**
 * 내가 참가 중인 챌린지 중 "이미 끝났거나 end_at 이 지난" 가장 최근 챌린지 1개의 정산 뷰.
 * options.challengeId 지정 시 그 특정 챌린지만. 없으면 null.
 * RLS 가 챌린지/참가자/로그 접근을 자동 필터링.
 */
export async function fetchRecap(
  viewerId: string,
  options: Options = {},
): Promise<RecapView | null> {
  const supabase = options.client ?? (await createClient());
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();

  // status='closed' 면 운영자가 명시적으로 종료 누름 → end_at 미래(조기 종료) 여도 정산 진입.
  // status='active' + end_at 지남 (만기 도달했지만 운영자 미종료) 도 정산 대상.
  // status='pending'/'accepted' 또는 active+end_at 미래(진행 중) 는 제외.
  // canonical 판정은 isChallengeOver(@withkey/domain, challenge/lifecycle, ADR-0027) — 아래 .or 는 그 SQL 미러
  // (Supabase 쿼리 빌더 문자열이라 TS 헬퍼를 직접 호출할 수 없어 동일 로직을 인라인 유지).
  let cq = supabase
    .from("challenges")
    .select(
      "id, title, goal_count, duration_days, penalty_amount, status, start_at, end_at, closed_at, groups!inner(id, name, owner_id, bank_code, account_holder, account_number_last4)",
    )
    .or(`status.eq.closed,and(status.eq.active,end_at.lte.${nowIso})`);
  if (options.challengeId) cq = cq.eq("id", options.challengeId);
  const { data: challenges, error } = await cq.order("end_at", { ascending: false }).limit(1);

  if (error || !challenges?.[0]) return null;
  const raw = challenges[0];
  const challenge: ChallengeRow = {
    id: raw.id as string,
    title: raw.title as string,
    goal_count: raw.goal_count as number,
    duration_days: raw.duration_days as number,
    penalty_amount: raw.penalty_amount as number,
    status: raw.status as ChallengeRow["status"],
    start_at: raw.start_at as string | null,
    end_at: raw.end_at as string | null,
    closed_at: raw.closed_at as string | null,
  };
  const groupRow = Array.isArray(raw.groups) ? raw.groups[0] : raw.groups;
  const group: RecapGroupView | null = groupRow
    ? {
        id: groupRow.id as string,
        name: (groupRow.name as string) ?? "",
        ownerId: groupRow.owner_id as string,
        bankCode: (groupRow.bank_code as string | null) ?? null,
        accountHolder: (groupRow.account_holder as string | null) ?? null,
        accountNumberLast4: (groupRow.account_number_last4 as string | null) ?? null,
      }
    : null;

  const { data: parts } = await supabase
    .from("challenge_participants")
    .select("user_id, users!inner(display_name)")
    .eq("challenge_id", challenge.id);

  const { data: logs } = await supabase
    .from("action_logs")
    .select("user_id, created_at, auto_verify_status")
    .eq("challenge_id", challenge.id);

  // 하루 N개 피드도 인증은 1회 → KST distinct day → 주차 버킷. start_at 없으면 빈 집계.
  // 🟨 peer_rejected(과반 반려)는 buildVisibleDoneByUserByWeek 에서 제외 (EVAL-0041).
  const startKey = challenge.start_at ? toKstDayKey(challenge.start_at) : null;
  const byUserByWeek = buildVisibleDoneByUserByWeek(logs ?? [], startKey, challenge.duration_days);

  const participants: ParticipantRow[] = (parts ?? []).map((p) => {
    const u = Array.isArray(p.users) ? p.users[0] : p.users;
    return {
      user_id: p.user_id,
      display_name: u?.display_name ?? null,
      doneByWeek: byUserByWeek.get(p.user_id) ?? new Map<number, number>(),
    };
  });

  return buildRecapView({ challenge, participants, viewerId, now, group });
}

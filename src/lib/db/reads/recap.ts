// src/lib/db/reads/recap.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { countDoneDaysByUser } from "@/lib/challenge/done-days";
import { computePerHeadPenalty, pickMvpIds } from "@/lib/challenge/settlement";

export type RecapMemberView = {
  id: string;
  displayName: string;
  doneCount: number;
  achieved: boolean;
  isMvp: boolean;
};

export type RecapGroupView = {
  id: string;
  name: string;
  ownerId: string;
  bankCode: string | null;
  accountHolder: string | null;
  accountNumberLast4: string | null;
};

export type RecapView = {
  challengeId: string;
  title: string;
  goalCount: number;
  durationDays: number;
  penaltyAmount: number;
  startAt: string | null;
  endAt: string | null;
  status: "active" | "closed";
  viewerId: string;
  viewerAchieved: boolean;
  viewerDoneCount: number;
  viewerPerHeadPenalty: number;
  // PRD §10 / 모킹업 §11 — 정산 시점 그룹 계좌 lazy prompt 에 필요.
  group: RecapGroupView | null;
  members: ReadonlyArray<RecapMemberView>;
  anyoneAchieved: boolean;
};

type ChallengeRow = {
  id: string;
  title: string;
  goal_count: number;
  duration_days: number;
  penalty_amount: number;
  status: "active" | "closed";
  start_at: string | null;
  end_at: string | null;
};

type ParticipantRow = {
  user_id: string;
  display_name: string | null;
  done_count: number;
};

export function buildRecapView(input: {
  challenge: ChallengeRow;
  participants: ReadonlyArray<ParticipantRow>;
  viewerId: string;
  now: Date;
  group?: RecapGroupView | null;
}): RecapView {
  const { challenge, participants, viewerId } = input;
  const mvpIds = pickMvpIds({
    goalCount: challenge.goal_count,
    members: participants.map((p) => ({ id: p.user_id, doneCount: p.done_count })),
  });

  const members: RecapMemberView[] = participants.map((p) => ({
    id: p.user_id,
    displayName: p.display_name ?? "익명",
    doneCount: p.done_count,
    achieved: p.done_count >= challenge.goal_count,
    isMvp: mvpIds.includes(p.user_id),
  }));

  const viewer = members.find((m) => m.id === viewerId);
  const viewerDoneCount = viewer?.doneCount ?? 0;

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
    viewerAchieved: viewerDoneCount >= challenge.goal_count,
    viewerDoneCount,
    viewerPerHeadPenalty: computePerHeadPenalty({
      doneCount: viewerDoneCount,
      goalCount: challenge.goal_count,
      penaltyAmount: challenge.penalty_amount,
    }),
    group: input.group ?? null,
    members,
    anyoneAchieved: members.some((m) => m.achieved),
  };
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
  // canonical 판정은 isChallengeOver(@/lib/challenge/lifecycle, ADR-0027) — 아래 .or 는 그 SQL 미러
  // (Supabase 쿼리 빌더 문자열이라 TS 헬퍼를 직접 호출할 수 없어 동일 로직을 인라인 유지).
  let cq = supabase
    .from("challenges")
    .select(
      "id, title, goal_count, duration_days, penalty_amount, status, start_at, end_at, groups!inner(id, name, owner_id, bank_code, account_holder, account_number_last4)",
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
    .select("user_id, created_at")
    .eq("challenge_id", challenge.id);

  // 하루 N개 피드도 인증은 1회 — KST 자정 기준 distinct day count.
  const doneByUser = countDoneDaysByUser(logs ?? []);

  const participants: ParticipantRow[] = (parts ?? []).map((p) => {
    const u = Array.isArray(p.users) ? p.users[0] : p.users;
    return {
      user_id: p.user_id,
      display_name: u?.display_name ?? null,
      done_count: doneByUser.get(p.user_id) ?? 0,
    };
  });

  return buildRecapView({ challenge, participants, viewerId, now, group });
}

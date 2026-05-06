import { createClient } from "@/lib/supabase/server";
import type { ChallengeStatus } from "./active-challenge";

export type GroupChallengeView = {
  groupId: string;
  groupName: string | null;
  // D-016: 마스킹·표시용 필드만 RSC 까지 내려보냄.
  // `account_number_encrypted` 컬럼은 의도적으로 SELECT 화이트리스트에서 제외 —
  // 평문 복호화는 `revealAccountNumber` Server Action 한 경로로만.
  bankCode: string | null;
  accountHolder: string | null;
  accountNumberLast4: string | null;
  challenge: {
    id: string;
    title: string;
    goalCount: number;
    durationDays: number;
    penaltyAmount: number;
    status: ChallengeStatus;
    startAt: string | null;
    endAt: string | null;
    doneCount: number;
    daysLeft: number;
    potTotal: number;
  } | null;
};

const DEFAULT_CURRENT_STATUSES = [
  "pending",
  "accepted",
  "active",
] as const satisfies readonly ChallengeStatus[];

type GroupRow = {
  id: string;
  name: string | null;
  bank_code: string | null;
  account_holder: string | null;
  account_number_last4: string | null;
};

type ChallengeRow = {
  id: string;
  group_id: string;
  title: string;
  goal_count: number;
  duration_days: number;
  penalty_amount: number;
  status: ChallengeStatus;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
};

/**
 * 내가 속한 모든 그룹 × 각 그룹의 "가장 최근 pending/accepted/active 챌린지" 1개.
 * 챌린지가 없는 그룹은 `challenge: null` (홈 스트립에서 "새 서약서" CTA 로 사용).
 * RLS(`groups` / `challenges` / `group_members`) 가 비멤버 필터링 담당.
 */
export async function fetchCurrentChallenges(userId: string): Promise<GroupChallengeView[]> {
  const supabase = await createClient();

  const { data: groups, error: groupsErr } = await supabase
    .from("groups")
    .select("id, name, bank_code, account_holder, account_number_last4")
    .is("disbanded_at", null)
    .order("created_at", { ascending: false });

  if (groupsErr || !groups) return [];
  const groupRows = groups as unknown as GroupRow[];
  if (groupRows.length === 0) return [];

  const groupIds = groupRows.map((g) => g.id);
  const { data: challenges } = await supabase
    .from("challenges")
    .select(
      "id, group_id, title, goal_count, duration_days, penalty_amount, status, start_at, end_at, created_at",
    )
    .in("group_id", groupIds)
    .in("status", [...DEFAULT_CURRENT_STATUSES])
    .order("created_at", { ascending: false });

  const latestByGroup = new Map<string, ChallengeRow>();
  for (const c of (challenges ?? []) as unknown as ChallengeRow[]) {
    if (!latestByGroup.has(c.group_id)) latestByGroup.set(c.group_id, c);
  }

  const challengeIds = Array.from(latestByGroup.values()).map((c) => c.id);
  if (challengeIds.length === 0) {
    return groupRows.map((g) => ({
      groupId: g.id,
      groupName: g.name,
      bankCode: g.bank_code,
      accountHolder: g.account_holder,
      accountNumberLast4: g.account_number_last4,
      challenge: null,
    }));
  }

  const doneByChallenge = new Map<string, number>();
  const { data: myLogs } = await supabase
    .from("action_logs")
    .select("challenge_id")
    .eq("user_id", userId)
    .in("challenge_id", challengeIds);
  for (const row of myLogs ?? []) {
    const id = (row as { challenge_id: string }).challenge_id;
    doneByChallenge.set(id, (doneByChallenge.get(id) ?? 0) + 1);
  }

  const memberCountByChallenge = new Map<string, number>();
  const { data: parts } = await supabase
    .from("challenge_participants")
    .select("challenge_id")
    .in("challenge_id", challengeIds);
  for (const row of parts ?? []) {
    const id = (row as { challenge_id: string }).challenge_id;
    memberCountByChallenge.set(id, (memberCountByChallenge.get(id) ?? 0) + 1);
  }

  return groupRows.map((g) => {
    const c = latestByGroup.get(g.id);
    if (!c) {
      return {
        groupId: g.id,
        groupName: g.name,
        bankCode: g.bank_code,
        accountHolder: g.account_holder,
        accountNumberLast4: g.account_number_last4,
        challenge: null,
      };
    }
    const daysLeft = c.end_at
      ? Math.max(0, Math.ceil((new Date(c.end_at).getTime() - Date.now()) / 86_400_000))
      : c.duration_days;
    const memberCount = memberCountByChallenge.get(c.id) ?? 0;
    return {
      groupId: g.id,
      groupName: g.name,
      bankCode: g.bank_code,
      accountHolder: g.account_holder,
      accountNumberLast4: g.account_number_last4,
      challenge: {
        id: c.id,
        title: c.title,
        goalCount: c.goal_count,
        durationDays: c.duration_days,
        penaltyAmount: c.penalty_amount,
        status: c.status,
        startAt: c.start_at,
        endAt: c.end_at,
        doneCount: doneByChallenge.get(c.id) ?? 0,
        daysLeft,
        potTotal: memberCount * c.penalty_amount,
      },
    };
  });
}

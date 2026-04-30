import { createClient } from "@/lib/supabase/server";

export type ChallengeStatus = "pending" | "accepted" | "active" | "closed";

export type ActiveChallengeView = {
  id: string;
  groupId: string;
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
};

type FetchActiveChallengeOptions = {
  statuses?: readonly ChallengeStatus[];
};

const DEFAULT_CURRENT_STATUSES = [
  "pending",
  "accepted",
  "active",
] as const satisfies readonly ChallengeStatus[];

/**
 * 내가 속한 그룹 중 가장 최근의 "진행 중 또는 서명 대기" 챌린지 1개.
 * 없으면 null. RLS 가 is_group_member 로 자동 필터링.
 */
export async function fetchActiveChallenge(
  userId: string,
  options: FetchActiveChallengeOptions = {},
): Promise<ActiveChallengeView | null> {
  const supabase = await createClient();
  const statuses = options.statuses ?? DEFAULT_CURRENT_STATUSES;

  const { data: challenges, error } = await supabase
    .from("challenges")
    .select(
      "id, group_id, title, goal_count, duration_days, penalty_amount, status, start_at, end_at",
    )
    .in("status", [...statuses])
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !challenges?.[0]) return null;
  const c = challenges[0];

  const { count: doneCount } = await supabase
    .from("action_logs")
    .select("id", { count: "exact", head: true })
    .eq("challenge_id", c.id)
    .eq("user_id", userId);

  const { count: memberCount } = await supabase
    .from("challenge_participants")
    .select("user_id", { count: "exact", head: true })
    .eq("challenge_id", c.id);

  const daysLeft = c.end_at
    ? Math.max(0, Math.ceil((new Date(c.end_at).getTime() - Date.now()) / 86_400_000))
    : c.duration_days;

  return {
    id: c.id,
    groupId: c.group_id,
    title: c.title,
    goalCount: c.goal_count,
    durationDays: c.duration_days,
    penaltyAmount: c.penalty_amount,
    status: c.status as ChallengeStatus,
    startAt: c.start_at,
    endAt: c.end_at,
    doneCount: doneCount ?? 0,
    daysLeft,
    potTotal: (memberCount ?? 0) * c.penalty_amount,
  };
}

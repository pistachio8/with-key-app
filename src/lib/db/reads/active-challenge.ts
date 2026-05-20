import { createClient } from "@/lib/supabase/server";
import { fetchCurrentChallenges } from "./current-challenges";

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
  // 코호트 분리(솔로 1 / 그룹 ≥2) + Kudos UI 분기에 사용 — PR-2.
  participantCount: number;
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
 *
 * @deprecated 신규 호출자는 `fetchCurrentChallenges(userId)` 를 사용.
 *             기본 status 호출은 내부적으로 그쪽으로 위임한다.
 */
export async function fetchActiveChallenge(
  userId: string,
  options: FetchActiveChallengeOptions = {},
): Promise<ActiveChallengeView | null> {
  // 기본 status 사용 시 — active 챌린지는 내가 참가자인 경우만 현재 챌린지로 취급한다.
  // active 이후 초대 유입자는 다음 챌린지 대기 상태이므로 레거시 /action, /feed 진입에서 제외.
  const usingDefaults = options.statuses === undefined;
  if (usingDefaults) {
    const groups = await fetchCurrentChallenges(userId);
    const firstWithChallenge = groups.find(
      (g) =>
        g.challenge !== null && (g.challenge.status !== "active" || g.challenge.userIsParticipant),
    );
    if (!firstWithChallenge || !firstWithChallenge.challenge) return null;
    const c = firstWithChallenge.challenge;
    return {
      id: c.id,
      groupId: firstWithChallenge.groupId,
      title: c.title,
      goalCount: c.goalCount,
      durationDays: c.durationDays,
      penaltyAmount: c.penaltyAmount,
      status: c.status,
      startAt: c.startAt,
      endAt: c.endAt,
      doneCount: c.doneCount,
      daysLeft: c.daysLeft,
      potTotal: c.potTotal,
      participantCount: c.participantCount,
    };
  }

  const requestedStatuses = options.statuses;
  if (requestedStatuses?.length === 1 && requestedStatuses[0] === "active") {
    const groups = await fetchCurrentChallenges(userId);
    const firstActiveParticipantChallenge = groups.find(
      (g) => g.challenge?.status === "active" && g.challenge.userIsParticipant,
    );
    if (!firstActiveParticipantChallenge?.challenge) return null;
    const c = firstActiveParticipantChallenge.challenge;
    return {
      id: c.id,
      groupId: firstActiveParticipantChallenge.groupId,
      title: c.title,
      goalCount: c.goalCount,
      durationDays: c.durationDays,
      penaltyAmount: c.penaltyAmount,
      status: c.status,
      startAt: c.startAt,
      endAt: c.endAt,
      doneCount: c.doneCount,
      daysLeft: c.daysLeft,
      potTotal: c.potTotal,
      participantCount: c.participantCount,
    };
  }

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
    participantCount: memberCount ?? 0,
  };
}

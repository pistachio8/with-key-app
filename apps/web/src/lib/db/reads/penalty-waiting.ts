import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// 홈 "만회 찬스 대기" 섹션 read (spec §C3 진입점 / EVAL-0044). settlement-pending(current-challenges) 미러.
//
// 진입로 문제: 창2 는 챌린지가 closed 인 동안 열리는데 fetchCurrentChallenges 는 pending/accepted/active 만
// 보여줘 closed 엔 진입로가 없다(spec §타임라인). 그래서 본 read 가 별도로
//   closed + penalty_mission IS NOT NULL + 창2 open([종료+48h, +96h]) 인 챌린지를 viewer 의 그룹에서 모은다.
//
// viewer-keyed private cache — fetchCurrentChallenges 와 동일하게 home-feed tag 로 묶어 mutation 시 함께 무효화.

const WINDOW_OPEN_MS = 48 * 60 * 60 * 1000;
const WINDOW_CLOSE_MS = 96 * 60 * 60 * 1000;

export type PenaltyWaitingView = {
  challengeId: string;
  title: string;
  groupName: string | null;
  penaltyAmount: number;
};

type ChallengeRow = {
  id: string;
  title: string;
  group_id: string;
  penalty_amount: number;
  penalty_mission: string | null;
  end_at: string | null;
  closed_at: string | null;
};

async function fetchPenaltyWaitingInner(userId: string): Promise<PenaltyWaitingView[]> {
  "use cache: private";
  cacheTag(`user-${userId}-home-feed`);
  cacheLife("minutes");

  const supabase = await createClient();

  // RLS(groups_select_member)가 viewer 그룹만 통과시킨다.
  const { data: groups } = await supabase
    .from("groups")
    .select("id, name")
    .is("disbanded_at", null);
  if (!groups || groups.length === 0) return [];
  const nameByGroup = new Map<string, string | null>(groups.map((g) => [g.id, g.name]));

  // closed + penalty_mission 있는 챌린지(RLS: 그룹 멤버만). 창2 게이트는 메모리에서 적용.
  const { data: challenges } = await supabase
    .from("challenges")
    .select("id, title, group_id, penalty_amount, penalty_mission, end_at, closed_at")
    .in("group_id", [...nameByGroup.keys()])
    .eq("status", "closed")
    .not("penalty_mission", "is", null);
  if (!challenges || challenges.length === 0) return [];

  const now = Date.now();
  const open = (challenges as unknown as ChallengeRow[]).filter((c) => {
    const endAt = c.closed_at ?? c.end_at;
    if (!endAt) return false;
    const end = new Date(endAt).getTime();
    return now >= end + WINDOW_OPEN_MS && now <= end + WINDOW_CLOSE_MS;
  });
  if (open.length === 0) return [];

  // viewer 가 서약 참가자인 챌린지만 — 비참가 챌린지는 진입로에 노출하지 않는다.
  const { data: parts } = await supabase
    .from("challenge_participants")
    .select("challenge_id")
    .eq("user_id", userId)
    .not("signed_at", "is", null)
    .in(
      "challenge_id",
      open.map((c) => c.id),
    );
  const mySignedIds = new Set((parts ?? []).map((p) => p.challenge_id));

  return open
    .filter((c) => mySignedIds.has(c.id))
    .map((c) => ({
      challengeId: c.id,
      title: c.title,
      groupName: nameByGroup.get(c.group_id) ?? null,
      penaltyAmount: c.penalty_amount,
    }));
}

export async function fetchPenaltyWaiting(userId: string): Promise<PenaltyWaitingView[]> {
  return fetchPenaltyWaitingInner(userId);
}

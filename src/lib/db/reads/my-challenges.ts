import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ChallengeStatus } from "./active-challenge";

export type MyChallengeItem = {
  id: string;
  title: string;
  status: ChallengeStatus;
  startAt: string | null;
  endAt: string | null;
  ownerId: string;
};

export type MyChallenges = {
  owner: MyChallengeItem[];
  member: MyChallengeItem[];
};

// 모킹업 §12 — /me/challenges 의 운영/참여 분리.
// 사용자가 participant 인 모든 챌린지를 한 번에 fetch 후 owner 여부로 분리.
export async function fetchMyChallenges(userId: string): Promise<MyChallenges> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("challenge_participants")
    .select(
      "challenge_id, challenges!inner(id, title, status, start_at, end_at, group_id, groups!inner(owner_id))",
    )
    .eq("user_id", userId);

  if (error || !data) return { owner: [], member: [] };

  const owner: MyChallengeItem[] = [];
  const member: MyChallengeItem[] = [];
  for (const row of data) {
    const c = Array.isArray(row.challenges) ? row.challenges[0] : row.challenges;
    if (!c) continue;
    const g = Array.isArray(c.groups) ? c.groups[0] : c.groups;
    const ownerId = (g?.owner_id as string) ?? "";
    const item: MyChallengeItem = {
      id: c.id as string,
      title: c.title as string,
      status: c.status as ChallengeStatus,
      startAt: (c.start_at as string | null) ?? null,
      endAt: (c.end_at as string | null) ?? null,
      ownerId,
    };
    if (ownerId === userId) owner.push(item);
    else member.push(item);
  }
  // active > accepted > pending > closed 순.
  const rank: Record<ChallengeStatus, number> = {
    active: 0,
    accepted: 1,
    pending: 2,
    closed: 3,
  };
  const byStatus = (a: MyChallengeItem, b: MyChallengeItem) => rank[a.status] - rank[b.status];
  owner.sort(byStatus);
  member.sort(byStatus);
  return { owner, member };
}

export type MyChallengeCounts = {
  owner: number;
  member: number;
  totalParticipated: number;
};

export function deriveCounts(my: MyChallenges): MyChallengeCounts {
  const ownerActive = my.owner.filter((c) => c.status !== "closed").length;
  const memberActive = my.member.filter((c) => c.status !== "closed").length;
  const totalParticipated = my.owner.length + my.member.length;
  return { owner: ownerActive, member: memberActive, totalParticipated };
}

import { createClient } from "@/lib/supabase/server";

export type ChallengeMemberView = {
  id: string;
  displayName: string;
  doneCount: number;
  signed: boolean;
};

export type ChallengeDetailView = {
  id: string;
  title: string;
  goalCount: number;
  durationDays: number;
  penaltyAmount: number;
  status: "pending" | "accepted" | "active" | "closed";
  members: ChallengeMemberView[];
  potTotal: number;
};

export async function fetchChallengeDetail(
  challengeId: string,
): Promise<ChallengeDetailView | null> {
  const supabase = await createClient();
  const { data: c, error } = await supabase
    .from("challenges")
    .select("id, title, goal_count, duration_days, penalty_amount, status")
    .eq("id", challengeId)
    .maybeSingle();
  if (error || !c) return null;

  const { data: parts } = await supabase
    .from("challenge_participants")
    .select("user_id, signed_at, users!inner(display_name)")
    .eq("challenge_id", challengeId);

  const counts = new Map<string, number>();
  const { data: logs } = await supabase
    .from("action_logs")
    .select("user_id")
    .eq("challenge_id", challengeId);
  for (const l of logs ?? []) {
    counts.set(l.user_id, (counts.get(l.user_id) ?? 0) + 1);
  }

  const members: ChallengeMemberView[] = (parts ?? []).map((p) => {
    const u = Array.isArray(p.users) ? p.users[0] : p.users;
    return {
      id: p.user_id,
      displayName: u?.display_name ?? "익명",
      doneCount: counts.get(p.user_id) ?? 0,
      signed: p.signed_at != null,
    };
  });

  return {
    id: c.id,
    title: c.title,
    goalCount: c.goal_count,
    durationDays: c.duration_days,
    penaltyAmount: c.penalty_amount,
    status: c.status as ChallengeDetailView["status"],
    members,
    potTotal: members.length * c.penalty_amount,
  };
}

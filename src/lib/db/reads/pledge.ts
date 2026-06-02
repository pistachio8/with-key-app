import { createClient } from "@/lib/supabase/server";

export type PledgeView = {
  id: string;
  title: string;
  goalCount: number;
  durationDays: number;
  penaltyAmount: number;
  members: ReadonlyArray<{ id: string; displayName: string; signed: boolean }>;
  mySigned: boolean;
};

export async function fetchPendingPledge(
  userId: string,
  challengeId?: string,
): Promise<PledgeView | null> {
  const supabase = await createClient();
  let query = supabase
    .from("challenge_participants")
    .select(
      "challenge_id, challenges!inner(id, title, goal_count, duration_days, penalty_amount, status)",
    )
    .eq("user_id", userId)
    .in("challenges.status", ["pending", "accepted"]);
  if (challengeId) {
    query = query.eq("challenge_id", challengeId);
  }
  const { data: self } = await query.limit(1).maybeSingle();

  if (!self) return null;
  const c = Array.isArray(self.challenges) ? self.challenges[0] : self.challenges;
  if (!c) return null;

  const { data: allParts } = await supabase
    .from("challenge_participants")
    .select("user_id, signed_at, users!inner(display_name)")
    .eq("challenge_id", c.id);

  const members = (allParts ?? []).map((p) => {
    const u = Array.isArray(p.users) ? p.users[0] : p.users;
    return {
      id: p.user_id,
      displayName: u?.display_name ?? "익명",
      signed: p.signed_at != null,
    };
  });
  const mySigned = members.find((m) => m.id === userId)?.signed ?? false;

  return {
    id: c.id,
    title: c.title,
    goalCount: c.goal_count,
    durationDays: c.duration_days,
    penaltyAmount: c.penalty_amount,
    members,
    mySigned,
  };
}

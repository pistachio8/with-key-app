// src/lib/db/reads/invite.ts
import "server-only";
import { adminClient } from "@/lib/supabase/admin";

export type InvitePreview = {
  groupId: string;
  groupName: string | null;
  expiresAt: string;
  expired: boolean;
  full: boolean;
  // pending 챌린지가 있으면 1줄 요약을 같이 내려줌 — 친구가 참여 전에 조건 확인 가능.
  pendingChallenge: {
    title: string;
    goalCount: number;
    penaltyAmount: number;
    durationDays: number;
  } | null;
};

// invites RLS 는 오너 SELECT 전용 → service_role 로 최소 필드만 조회.
// 조회 자체가 민감 정보 유출이 되지 않도록 token 을 찾지 못하면 null 로 대체한다.
export async function fetchInvitePreview(token: string): Promise<InvitePreview | null> {
  if (!token) return null;
  const client = adminClient();

  const { data: invite } = await client
    .from("invites")
    .select("group_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return null;

  const [{ data: group }, { count }, { data: challenge }] = await Promise.all([
    client.from("groups").select("id, name").eq("id", invite.group_id).maybeSingle(),
    client
      .from("group_members")
      .select("*", { count: "exact", head: true })
      .eq("group_id", invite.group_id),
    client
      .from("challenges")
      .select("title, goal_count, penalty_amount, duration_days")
      .eq("group_id", invite.group_id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!group) return null;

  return {
    groupId: group.id,
    groupName: group.name,
    expiresAt: invite.expires_at,
    expired: new Date(invite.expires_at).getTime() <= Date.now(),
    full: (count ?? 0) >= 4,
    pendingChallenge: challenge
      ? {
          title: challenge.title,
          goalCount: challenge.goal_count,
          penaltyAmount: challenge.penalty_amount,
          durationDays: challenge.duration_days,
        }
      : null,
  };
}

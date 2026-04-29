import { admin } from "./setup";

export async function createUser(opts: { displayName?: string } = {}) {
  const suffix = Math.random().toString(36).slice(2, 10);
  const email = `u-${suffix}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error) throw error;
  const userId = data.user.id;
  const { error: insertErr } = await admin.from("users").insert({
    id: userId,
    display_name: opts.displayName ?? `User-${userId.slice(0, 4)}`,
  });
  // handle_new_auth_user trigger may already have inserted — ignore duplicate-key.
  if (insertErr && insertErr.code !== "23505") throw insertErr;
  return { id: userId, email };
}

export async function createGroup(ownerId: string, opts: { name?: string } = {}) {
  const { data, error } = await admin
    .from("groups")
    .insert({ owner_id: ownerId, name: opts.name ?? "테스트 그룹" })
    .select()
    .single();
  if (error) throw error;
  await admin.from("group_members").insert({
    group_id: data.id,
    user_id: ownerId,
    role: "owner",
  });
  return data as { id: string; owner_id: string; name: string };
}

export async function addMember(groupId: string, userId: string) {
  const { error } = await admin
    .from("group_members")
    .insert({ group_id: groupId, user_id: userId, role: "member" });
  if (error) throw error;
}

export async function createPendingChallenge(
  groupId: string,
  opts: {
    title?: string;
    penaltyAmount?: number;
    durationDays?: number;
    goalCount?: number;
  } = {},
) {
  const { data, error } = await admin
    .from("challenges")
    .insert({
      group_id: groupId,
      title: opts.title ?? "주 3회 헬스장",
      type: "fitness",
      goal_count: opts.goalCount ?? 3,
      duration_days: opts.durationDays ?? 7,
      penalty_amount: opts.penaltyAmount ?? 3000,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return data as { id: string; group_id: string; status: string };
}

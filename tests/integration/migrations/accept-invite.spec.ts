import { describe, it, expect } from "vitest";
import { asUser, admin, expectRlsDenied } from "../setup";
import { createUser, createGroup, addMember, createPendingChallenge } from "../factories";

async function createInviteRow(
  groupId: string,
  ownerId: string,
  opts: { expiresInMs?: number; token?: string } = {},
) {
  const token = opts.token ?? `tok-${Math.random().toString(36).slice(2, 20)}`;
  const expiresAt = new Date(Date.now() + (opts.expiresInMs ?? 72 * 3600 * 1000)).toISOString();
  const { data, error } = await admin
    .from("invites")
    .insert({ group_id: groupId, token, expires_at: expiresAt, created_by: ownerId })
    .select()
    .single();
  if (error) throw error;
  return data as { id: string; token: string };
}

describe("accept_invite RPC", () => {
  it("adds the caller as member and returns group_id", async () => {
    const owner = await createUser();
    const joiner = await createUser();
    const g = await createGroup(owner.id);
    const invite = await createInviteRow(g.id, owner.id);

    const client = await asUser(joiner);
    const { data, error } = await client.rpc("accept_invite", { p_token: invite.token });
    expect(error).toBeNull();
    expect(data).toBe(g.id);

    const { data: members } = await admin
      .from("group_members")
      .select("user_id, role")
      .eq("group_id", g.id);
    expect(members?.find((m) => m.user_id === joiner.id)?.role).toBe("member");
  });

  it("is idempotent: existing member accepting again is no-op and returns group_id", async () => {
    const owner = await createUser();
    const joiner = await createUser();
    const g = await createGroup(owner.id);
    await addMember(g.id, joiner.id);
    const invite = await createInviteRow(g.id, owner.id);

    const client = await asUser(joiner);
    const { data, error } = await client.rpc("accept_invite", { p_token: invite.token });
    expect(error).toBeNull();
    expect(data).toBe(g.id);

    const { count } = await admin
      .from("group_members")
      .select("*", { count: "exact", head: true })
      .eq("group_id", g.id)
      .eq("user_id", joiner.id);
    expect(count).toBe(1);
  });

  it("rejects expired token with not_found-ish error (P0002)", async () => {
    const owner = await createUser();
    const joiner = await createUser();
    const g = await createGroup(owner.id);
    const invite = await createInviteRow(g.id, owner.id, { expiresInMs: -1000 });

    const client = await asUser(joiner);
    const { error } = await client.rpc("accept_invite", { p_token: invite.token });
    expect(error?.code).toBe("P0002");
  });

  it("rejects unknown token with P0002", async () => {
    const joiner = await createUser();
    const client = await asUser(joiner);
    const { error } = await client.rpc("accept_invite", { p_token: "nonexistent-token" });
    expect(error?.code).toBe("P0002");
  });

  it("rejects when group already has 4 members (forbidden)", async () => {
    const owner = await createUser();
    const m1 = await createUser();
    const m2 = await createUser();
    const m3 = await createUser();
    const joiner = await createUser();
    const g = await createGroup(owner.id);
    await addMember(g.id, m1.id);
    await addMember(g.id, m2.id);
    await addMember(g.id, m3.id);
    const invite = await createInviteRow(g.id, owner.id);

    const client = await asUser(joiner);
    const { error } = await client.rpc("accept_invite", { p_token: invite.token });
    expectRlsDenied(error);
  });

  it("auto-joins pending challenge participants", async () => {
    const owner = await createUser();
    const joiner = await createUser();
    const g = await createGroup(owner.id);
    const c = await createPendingChallenge(g.id);
    await admin.from("challenge_participants").insert({ challenge_id: c.id, user_id: owner.id });
    const invite = await createInviteRow(g.id, owner.id);

    const client = await asUser(joiner);
    const { error } = await client.rpc("accept_invite", { p_token: invite.token });
    expect(error).toBeNull();

    const { data: parts } = await admin
      .from("challenge_participants")
      .select("user_id, signed_at")
      .eq("challenge_id", c.id);
    const me = parts?.find((p) => p.user_id === joiner.id);
    expect(me).toBeDefined();
    expect(me?.signed_at).toBeNull();
  });

  it("does not join challenge that is already active (freeze)", async () => {
    const owner = await createUser();
    const joiner = await createUser();
    const g = await createGroup(owner.id);
    // Create as pending then promote to active manually — active challenges
    // have no "pending" peer, so accept_invite must skip participant insert.
    const c = await createPendingChallenge(g.id);
    await admin
      .from("challenges")
      .update({
        status: "active",
        start_at: new Date().toISOString(),
        end_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })
      .eq("id", c.id);
    const invite = await createInviteRow(g.id, owner.id);

    const client = await asUser(joiner);
    const { error } = await client.rpc("accept_invite", { p_token: invite.token });
    expect(error).toBeNull();

    const { data: parts } = await admin
      .from("challenge_participants")
      .select("user_id")
      .eq("challenge_id", c.id)
      .eq("user_id", joiner.id);
    expect(parts ?? []).toHaveLength(0);
  });
});

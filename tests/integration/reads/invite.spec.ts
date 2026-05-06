// tests/integration/reads/invite.spec.ts
import { describe, it, expect } from "vitest";
import { admin } from "../setup";
import { createUser, createGroup, addMember, createPendingChallenge } from "../factories";
import { fetchInvitePreview } from "@/lib/db/reads/invite";

async function createInviteRow(groupId: string, ownerId: string, expiresInMs = 72 * 3600 * 1000) {
  const token = `tok-${Math.random().toString(36).slice(2, 20)}`;
  const expires = new Date(Date.now() + expiresInMs).toISOString();
  const { data, error } = await admin
    .from("invites")
    .insert({ group_id: groupId, token, expires_at: expires, created_by: ownerId })
    .select()
    .single();
  if (error) throw error;
  return data as { token: string };
}

describe("fetchInvitePreview", () => {
  it("returns groupName + not-expired + not-full + null challenge when no pending challenge", async () => {
    const owner = await createUser();
    const g = await createGroup(owner.id, { name: "민지네" });
    const inv = await createInviteRow(g.id, owner.id);

    const preview = await fetchInvitePreview(inv.token);
    expect(preview).not.toBeNull();
    expect(preview!.groupName).toBe("민지네");
    expect(preview!.expired).toBe(false);
    expect(preview!.full).toBe(false);
    expect(preview!.pendingChallenge).toBeNull();
  });

  it("includes latest pending challenge summary when one exists", async () => {
    const owner = await createUser();
    const g = await createGroup(owner.id, { name: "민지네" });
    await createPendingChallenge(g.id, {
      title: "주 3회 헬스장",
      goalCount: 3,
      penaltyAmount: 3000,
      durationDays: 7,
    });
    const inv = await createInviteRow(g.id, owner.id);

    const preview = await fetchInvitePreview(inv.token);
    expect(preview?.pendingChallenge).toEqual({
      title: "주 3회 헬스장",
      goalCount: 3,
      penaltyAmount: 3000,
      durationDays: 7,
    });
  });

  it("flags expired=true when expires_at in the past", async () => {
    const owner = await createUser();
    const g = await createGroup(owner.id);
    const inv = await createInviteRow(g.id, owner.id, -1000);

    const preview = await fetchInvitePreview(inv.token);
    expect(preview?.expired).toBe(true);
  });

  it("flags full=true when group already has 4 members", async () => {
    const owner = await createUser();
    const g = await createGroup(owner.id);
    for (let i = 0; i < 3; i++) {
      const u = await createUser();
      await addMember(g.id, u.id);
    }
    const inv = await createInviteRow(g.id, owner.id);

    const preview = await fetchInvitePreview(inv.token);
    expect(preview?.full).toBe(true);
  });

  it("returns null for unknown token", async () => {
    const preview = await fetchInvitePreview("does-not-exist");
    expect(preview).toBeNull();
  });
});

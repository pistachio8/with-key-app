import { describe, it, expect } from "vitest";
import { asUser, admin } from "../setup";
import { createUser, createGroup, addMember, createPendingChallenge } from "../factories";

describe("pledge signing and owner start RPCs", () => {
  it("last signer stays pending until the owner starts the challenge", async () => {
    const owner = await createUser();
    const m2 = await createUser();
    const g = await createGroup(owner.id);
    await addMember(g.id, m2.id);
    const c = await createPendingChallenge(g.id, { durationDays: 7 });
    await admin.from("challenge_participants").insert([
      { challenge_id: c.id, user_id: owner.id },
      { challenge_id: c.id, user_id: m2.id },
    ]);

    const ownerClient = await asUser(owner);
    const r1 = await ownerClient.rpc("sign_and_maybe_activate", { p_challenge_id: c.id });
    expect(r1.error).toBeNull();
    expect(r1.data?.[0].status).toBe("pending");

    const m2Client = await asUser(m2);
    const r2 = await m2Client.rpc("sign_and_maybe_activate", { p_challenge_id: c.id });
    expect(r2.error).toBeNull();
    expect(r2.data?.[0].status).toBe("pending");
    expect(r2.data?.[0].start_at).toBeNull();
    expect(r2.data?.[0].end_at).toBeNull();
  });

  it("non-participant is rejected (42501)", async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const g = await createGroup(owner.id);
    const c = await createPendingChallenge(g.id);
    await admin.from("challenge_participants").insert({ challenge_id: c.id, user_id: owner.id });

    const client = await asUser(outsider);
    const { error } = await client.rpc("sign_and_maybe_activate", { p_challenge_id: c.id });
    expect(error?.code).toBe("42501");
  });

  it("owner starts with signed participants and drops unsigned participants", async () => {
    const owner = await createUser();
    const signedFriend = await createUser();
    const unsignedFriend = await createUser();
    const g = await createGroup(owner.id);
    await addMember(g.id, signedFriend.id);
    await addMember(g.id, unsignedFriend.id);
    const c = await createPendingChallenge(g.id, { durationDays: 7 });
    await admin.from("challenge_participants").insert([
      { challenge_id: c.id, user_id: owner.id, signed_at: new Date().toISOString() },
      { challenge_id: c.id, user_id: signedFriend.id, signed_at: new Date().toISOString() },
      { challenge_id: c.id, user_id: unsignedFriend.id },
    ]);

    const ownerClient = await asUser(owner);
    const started = await ownerClient.rpc("start_challenge_with_signed_participants", {
      p_challenge_id: c.id,
    });
    expect(started.error).toBeNull();
    expect(started.data?.[0].status).toBe("active");
    expect(started.data?.[0].participant_count).toBe(2);
    expect(started.data?.[0].start_at).toBeTruthy();
    expect(started.data?.[0].end_at).toBeTruthy();

    const { data: parts } = await admin
      .from("challenge_participants")
      .select("user_id")
      .eq("challenge_id", c.id);
    expect(parts?.map((p) => p.user_id).sort()).toEqual([owner.id, signedFriend.id].sort());
  });

  it("non-owner cannot start a challenge", async () => {
    const owner = await createUser();
    const m2 = await createUser();
    const g = await createGroup(owner.id);
    await addMember(g.id, m2.id);
    const c = await createPendingChallenge(g.id);
    await admin.from("challenge_participants").insert([
      { challenge_id: c.id, user_id: owner.id, signed_at: new Date().toISOString() },
      { challenge_id: c.id, user_id: m2.id, signed_at: new Date().toISOString() },
    ]);

    const m2Client = await asUser(m2);
    const { error } = await m2Client.rpc("start_challenge_with_signed_participants", {
      p_challenge_id: c.id,
    });
    expect(error?.code).toBe("42501");
  });
});

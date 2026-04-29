import { describe, it, expect } from "vitest";
import { asUser, admin } from "../setup";
import { createUser, createGroup, addMember, createPendingChallenge } from "../factories";

describe("sign_and_maybe_activate RPC", () => {
  it("last signer flips status to active and sets start/end", async () => {
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
    expect(r2.data?.[0].status).toBe("active");
    expect(r2.data?.[0].start_at).toBeTruthy();
    expect(r2.data?.[0].end_at).toBeTruthy();
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
});

import { describe, it, expect } from "vitest";
import { admin } from "../setup";
import { createUser, createGroup, createPendingChallenge } from "../factories";

// 0036_visibility_version.sql · plan v4 §Phase 2.
// trigger trg_bump_challenge_visibility 가 challenge_participants 의 INSERT/DELETE
// 시에만 chosen challenge 의 visibility_version 을 +1 증분하는지 검증.
describe("0036_visibility_version trigger", () => {
  it("starts at 0 for a newly created challenge", async () => {
    const owner = await createUser();
    const g = await createGroup(owner.id);
    const c = await createPendingChallenge(g.id);

    const { data, error } = await admin
      .from("challenges")
      .select("visibility_version")
      .eq("id", c.id)
      .single();

    expect(error).toBeNull();
    expect(data?.visibility_version).toBe(0);
  });

  it("bumps when a participant is inserted", async () => {
    const owner = await createUser();
    const member = await createUser();
    const g = await createGroup(owner.id);
    const c = await createPendingChallenge(g.id);

    const { data: before } = await admin
      .from("challenges")
      .select("visibility_version")
      .eq("id", c.id)
      .single();

    const { error: insertError } = await admin
      .from("challenge_participants")
      .insert({ challenge_id: c.id, user_id: member.id });
    expect(insertError).toBeNull();

    const { data: after } = await admin
      .from("challenges")
      .select("visibility_version")
      .eq("id", c.id)
      .single();

    expect(after?.visibility_version).toBe((before?.visibility_version ?? 0) + 1);
  });

  it("bumps when a participant is deleted", async () => {
    const owner = await createUser();
    const member = await createUser();
    const g = await createGroup(owner.id);
    const c = await createPendingChallenge(g.id);

    await admin.from("challenge_participants").insert({ challenge_id: c.id, user_id: member.id });

    const { data: before } = await admin
      .from("challenges")
      .select("visibility_version")
      .eq("id", c.id)
      .single();

    const { error: deleteError } = await admin
      .from("challenge_participants")
      .delete()
      .eq("challenge_id", c.id)
      .eq("user_id", member.id);
    expect(deleteError).toBeNull();

    const { data: after } = await admin
      .from("challenges")
      .select("visibility_version")
      .eq("id", c.id)
      .single();

    expect(after?.visibility_version).toBe((before?.visibility_version ?? 0) + 1);
  });

  it("does not bump on participant UPDATE (e.g. signed_at)", async () => {
    const owner = await createUser();
    const member = await createUser();
    const g = await createGroup(owner.id);
    const c = await createPendingChallenge(g.id);

    await admin.from("challenge_participants").insert({ challenge_id: c.id, user_id: member.id });

    const { data: before } = await admin
      .from("challenges")
      .select("visibility_version")
      .eq("id", c.id)
      .single();

    // signed_at 같은 컬럼 변경은 visibility 영향 없음.
    await admin
      .from("challenge_participants")
      .update({ signed_at: new Date().toISOString() })
      .eq("challenge_id", c.id)
      .eq("user_id", member.id);

    const { data: after } = await admin
      .from("challenges")
      .select("visibility_version")
      .eq("id", c.id)
      .single();

    expect(after?.visibility_version).toBe(before?.visibility_version);
  });

  it("isolates increments to the affected challenge only", async () => {
    const owner = await createUser();
    const member = await createUser();
    const g1 = await createGroup(owner.id, { name: "g1" });
    const g2 = await createGroup(owner.id, { name: "g2" });
    const c1 = await createPendingChallenge(g1.id);
    const c2 = await createPendingChallenge(g2.id);

    const { data: c2Before } = await admin
      .from("challenges")
      .select("visibility_version")
      .eq("id", c2.id)
      .single();

    await admin.from("challenge_participants").insert({ challenge_id: c1.id, user_id: member.id });

    const { data: c2After } = await admin
      .from("challenges")
      .select("visibility_version")
      .eq("id", c2.id)
      .single();

    expect(c2After?.visibility_version).toBe(c2Before?.visibility_version);
  });

  it("does not bump on challenges UPDATE (e.g. status)", async () => {
    const owner = await createUser();
    const g = await createGroup(owner.id);
    const c = await createPendingChallenge(g.id);

    const { data: before } = await admin
      .from("challenges")
      .select("visibility_version")
      .eq("id", c.id)
      .single();

    await admin.from("challenges").update({ status: "active" }).eq("id", c.id);

    const { data: after } = await admin
      .from("challenges")
      .select("visibility_version")
      .eq("id", c.id)
      .single();

    expect(after?.visibility_version).toBe(before?.visibility_version);
  });
});

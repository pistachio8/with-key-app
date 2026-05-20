import { describe, it, expect } from "vitest";
import { admin } from "../setup";
import { createUser, createGroup, createPendingChallenge } from "../factories";

describe("challenges_one_open_per_group partial unique index", () => {
  it("rejects a second pending challenge in the same group", async () => {
    const owner = await createUser();
    const g = await createGroup(owner.id);
    await createPendingChallenge(g.id);

    const { error } = await admin.from("challenges").insert({
      group_id: g.id,
      title: "두 번째",
      type: "fitness",
      goal_count: 3,
      duration_days: 7,
      penalty_amount: 3000,
      status: "pending",
    });

    expect(error?.code).toBe("23505");
  });

  it("rejects a second active challenge in the same group", async () => {
    const owner = await createUser();
    const g = await createGroup(owner.id);
    const first = await createPendingChallenge(g.id);
    await admin.from("challenges").update({ status: "active" }).eq("id", first.id);

    const { error } = await admin.from("challenges").insert({
      group_id: g.id,
      title: "두 번째",
      type: "fitness",
      goal_count: 3,
      duration_days: 7,
      penalty_amount: 3000,
      status: "pending",
    });

    expect(error?.code).toBe("23505");
  });

  it("allows a new pending after the previous one is closed", async () => {
    const owner = await createUser();
    const g = await createGroup(owner.id);
    const first = await createPendingChallenge(g.id);
    await admin.from("challenges").update({ status: "closed" }).eq("id", first.id);

    const { data, error } = await admin
      .from("challenges")
      .insert({
        group_id: g.id,
        title: "다음 챌린지",
        type: "fitness",
        goal_count: 3,
        duration_days: 7,
        penalty_amount: 3000,
        status: "pending",
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.status).toBe("pending");
  });

  it("allows pending challenges in different groups concurrently", async () => {
    const owner = await createUser();
    const g1 = await createGroup(owner.id, { name: "A" });
    const g2 = await createGroup(owner.id, { name: "B" });
    await createPendingChallenge(g1.id);

    const { data, error } = await admin
      .from("challenges")
      .insert({
        group_id: g2.id,
        title: "두 번째 그룹의 챌린지",
        type: "fitness",
        goal_count: 3,
        duration_days: 7,
        penalty_amount: 3000,
        status: "pending",
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.group_id).toBe(g2.id);
  });
});

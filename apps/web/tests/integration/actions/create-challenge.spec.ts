import { describe, it, expect } from "vitest";
import { asUser } from "../setup";
import { createUser, createGroup, addMember } from "../factories";

describe("createChallenge (RLS + insert contract)", () => {
  it("owner can insert challenge in their group", async () => {
    const owner = await createUser();
    const group = await createGroup(owner.id);
    const client = await asUser(owner);

    const { data, error } = await client
      .from("challenges")
      .insert({
        group_id: group.id,
        title: "주 3회 헬스장",
        type: "fitness",
        goal_count: 3,
        duration_days: 7,
        penalty_amount: 3000,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.status).toBe("pending");
  });

  it("non-owner member cannot insert challenge (RLS)", async () => {
    const owner = await createUser();
    const member = await createUser();
    const group = await createGroup(owner.id);
    await addMember(group.id, member.id);
    const client = await asUser(member);

    const { error } = await client.from("challenges").insert({
      group_id: group.id,
      title: "x",
      type: "fitness",
      goal_count: 3,
      duration_days: 7,
      penalty_amount: 3000,
    });
    expect(error).not.toBeNull();
  });

  it("penalty_amount 20000 violates CHECK (23514)", async () => {
    const owner = await createUser();
    const group = await createGroup(owner.id);
    const client = await asUser(owner);

    const { error } = await client.from("challenges").insert({
      group_id: group.id,
      title: "x",
      type: "fitness",
      goal_count: 3,
      duration_days: 7,
      penalty_amount: 20000,
    });
    expect(error?.code).toBe("23514");
  });
});

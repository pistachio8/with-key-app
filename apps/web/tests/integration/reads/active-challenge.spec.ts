import { describe, it, expect } from "vitest";
import { asUser } from "../setup";
import { createUser, createGroup, createPendingChallenge } from "../factories";

// read 함수는 next/headers 를 요구하므로 직접 호출 대신 동등 쿼리로 RLS 경계 확인.
describe("active-challenge read (RLS filter)", () => {
  it("member sees only their group's challenge", async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const g = await createGroup(owner.id);
    const c = await createPendingChallenge(g.id);

    const outsiderClient = await asUser(outsider);
    const { data } = await outsiderClient.from("challenges").select("id").eq("id", c.id);
    expect(data).toEqual([]);

    const ownerClient = await asUser(owner);
    const { data: ownerData } = await ownerClient.from("challenges").select("id").eq("id", c.id);
    expect(ownerData?.[0]?.id).toBe(c.id);
  });
});

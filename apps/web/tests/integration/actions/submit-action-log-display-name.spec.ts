import { describe, expect, it } from "vitest";
import { asUser } from "../setup";
import { createUser } from "../factories";

describe("display_name self-read RLS", () => {
  it("authed user can read their own display_name", async () => {
    const owner = await createUser({ displayName: "지우" });
    const client = await asUser(owner);
    const { data } = await client.from("users").select("display_name").eq("id", owner.id).single();
    expect(data?.display_name).toBe("지우");
  });
});

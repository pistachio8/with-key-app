import { describe, expect, it } from "vitest";
import { admin, asUser } from "../setup";
import { createUser } from "../factories";

describe("push_subscriptions — RLS", () => {
  it("owner can upsert their own subscription", async () => {
    const u = await createUser();
    const c = await asUser(u);
    const endpoint = `https://fcm.googleapis.com/fcm/send/${u.id}`;
    const { error } = await c
      .from("push_subscriptions")
      .upsert({ user_id: u.id, endpoint, p256dh: "p", auth: "a" }, { onConflict: "endpoint" });
    expect(error).toBeNull();

    const { data } = await admin
      .from("push_subscriptions")
      .select("user_id")
      .eq("endpoint", endpoint)
      .single();
    expect(data?.user_id).toBe(u.id);
  });

  it("owner cannot insert a row with another user's user_id", async () => {
    const owner = await createUser();
    const other = await createUser();
    const c = await asUser(owner);
    const { error } = await c.from("push_subscriptions").insert({
      user_id: other.id,
      endpoint: `https://fcm.googleapis.com/fcm/send/foreign-${owner.id}`,
      p256dh: "p",
      auth: "a",
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });
});

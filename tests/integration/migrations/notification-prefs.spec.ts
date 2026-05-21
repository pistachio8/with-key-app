import { describe, expect, it } from "vitest";
import { admin } from "../setup";
import { createUser } from "../factories";

describe("users.notification_prefs migration", () => {
  // ADR-0013 — migration 0031 이후 신규 가입자 default 는 OFF.
  it("defaults new rows to { start: false, deadline: false }", async () => {
    const user = await createUser();
    const { data, error } = await admin
      .from("users")
      .select("notification_prefs")
      .eq("id", user.id)
      .single();
    expect(error).toBeNull();
    expect(data?.notification_prefs).toEqual({ start: false, deadline: false });
  });

  it("allows updating to valid boolean shape", async () => {
    const user = await createUser();
    const { error } = await admin
      .from("users")
      .update({ notification_prefs: { start: false, deadline: true } })
      .eq("id", user.id);
    expect(error).toBeNull();
  });

  it("rejects invalid shape via CHECK constraint", async () => {
    const user = await createUser();
    const { error } = await admin
      .from("users")
      .update({
        notification_prefs: { start: "yes" } as unknown as object,
      })
      .eq("id", user.id);
    expect(error?.code).toBe("23514");
  });

  it("rejects missing key via CHECK constraint", async () => {
    const user = await createUser();
    const { error } = await admin
      .from("users")
      .update({
        notification_prefs: { start: true } as unknown as object,
      })
      .eq("id", user.id);
    expect(error?.code).toBe("23514");
  });
});

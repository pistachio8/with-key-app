import { describe, expect, it } from "vitest";
import { admin } from "../setup";
import { createUser } from "../factories";

describe("users.notification_prefs migration", () => {
  it("defaults new rows to { start: true, deadline: true }", async () => {
    const user = await createUser();
    const { data, error } = await admin
      .from("users")
      .select("notification_prefs")
      .eq("id", user.id)
      .single();
    expect(error).toBeNull();
    expect(data?.notification_prefs).toEqual({ start: true, deadline: true });
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

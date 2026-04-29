import { describe, it, expect } from "vitest";
import { asUser } from "./setup";
import { createUser } from "./factories";

describe("integration harness", () => {
  it("creates an auth user and signs in", async () => {
    const u = await createUser({ displayName: "해리스" });
    const client = await asUser(u);
    const { data, error } = await client.auth.getUser();
    expect(error).toBeNull();
    expect(data.user?.id).toBe(u.id);
  });

  it("isolates between tests (afterEach truncate)", async () => {
    const u = await createUser();
    expect(u.id).toBeTruthy();
  });
});

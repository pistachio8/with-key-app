import { describe, it, expect } from "vitest";
import { groupInputSchema } from "./group";
import { inviteTokenSchema } from "./invite";

describe("groupInputSchema", () => {
  it("allows empty object (name is optional)", () => {
    expect(groupInputSchema.safeParse({}).success).toBe(true);
  });

  it("accepts name up to 30 chars", () => {
    expect(groupInputSchema.safeParse({ name: "민지네 🏋️" }).success).toBe(true);
    expect(groupInputSchema.safeParse({ name: "x".repeat(30) }).success).toBe(true);
  });

  it("rejects name over 30 chars", () => {
    expect(groupInputSchema.safeParse({ name: "x".repeat(31) }).success).toBe(false);
  });
});

describe("inviteTokenSchema", () => {
  it("accepts non-empty string", () => {
    expect(inviteTokenSchema.safeParse("abc").success).toBe(true);
  });

  it("rejects empty string", () => {
    expect(inviteTokenSchema.safeParse("").success).toBe(false);
  });
});

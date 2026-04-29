import { describe, it, expect } from "vitest";
import { kudosInputSchema } from "./kudos";

describe("kudosInputSchema", () => {
  const uuid = "00000000-0000-4000-8000-000000000000";

  it("accepts actionLogId + emoji from 3-pool", () => {
    expect(kudosInputSchema.safeParse({ actionLogId: uuid, emoji: "🔥" }).success).toBe(true);
    expect(kudosInputSchema.safeParse({ actionLogId: uuid, emoji: "💪" }).success).toBe(true);
    expect(kudosInputSchema.safeParse({ actionLogId: uuid, emoji: "👏" }).success).toBe(true);
  });

  it("rejects emoji outside pool", () => {
    expect(kudosInputSchema.safeParse({ actionLogId: uuid, emoji: "❤️" }).success).toBe(false);
  });

  it("rejects invalid uuid", () => {
    expect(kudosInputSchema.safeParse({ actionLogId: "not-a-uuid", emoji: "🔥" }).success).toBe(
      false,
    );
  });

  it("rejects legacy feedItemId key", () => {
    expect(kudosInputSchema.safeParse({ feedItemId: uuid, emoji: "🔥" }).success).toBe(false);
  });
});

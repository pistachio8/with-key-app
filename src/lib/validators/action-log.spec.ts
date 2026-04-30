import { describe, expect, it } from "vitest";
import { actionLogInputSchema } from "./action-log";

describe("actionLogInputSchema", () => {
  const base = {
    challengeId: "00000000-0000-4000-8000-000000000001",
    activityType: "gym" as const,
    selectedKeywords: ["펌핑"],
    shownKeywords: ["펌핑", "하체데이", "스쿼트"],
    rerollCount: 0,
  };

  it("accepts action log input without photoUrl", () => {
    expect(actionLogInputSchema.safeParse(base).success).toBe(true);
  });

  it("rejects legacy photoUrl payloads", () => {
    const parsed = actionLogInputSchema.safeParse({
      ...base,
      photoUrl: "https://example.com/x.jpg",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects selected keywords outside the activity pool", () => {
    const parsed = actionLogInputSchema.safeParse({
      ...base,
      selectedKeywords: ["명상"],
    });
    expect(parsed.success).toBe(false);
  });
});

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

  // 직접 입력 일기 (spec 2026-05-28-action-manual-diary)
  it("accepts 0 keywords when a memo (direct diary) is provided", () => {
    const parsed = actionLogInputSchema.safeParse({
      ...base,
      selectedKeywords: [],
      memo: "오늘 헬스 다녀왔어요. 직접 쓴 일기예요.",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects 0 keywords when there is no memo (AI mode)", () => {
    const parsed = actionLogInputSchema.safeParse({
      ...base,
      selectedKeywords: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("treats a whitespace-only memo as no memo (still requires a keyword)", () => {
    const parsed = actionLogInputSchema.safeParse({
      ...base,
      selectedKeywords: [],
      memo: "   ",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a 150-char memo and rejects 151", () => {
    expect(
      actionLogInputSchema.safeParse({ ...base, selectedKeywords: [], memo: "가".repeat(150) })
        .success,
    ).toBe(true);
    expect(
      actionLogInputSchema.safeParse({ ...base, selectedKeywords: [], memo: "가".repeat(151) })
        .success,
    ).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { challengeInputSchema } from "./challenge";

const base = {
  title: "주 3회 운동",
  type: "fitness" as const,
  goalCount: 3,
};

describe("challengeInputSchema", () => {
  it("accepts 7~90 day duration (D-006, ADR-0004 min 1 week)", () => {
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 7, penaltyAmount: 3000 }).success,
    ).toBe(true);
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 30, penaltyAmount: 3000 }).success,
    ).toBe(true);
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 90, penaltyAmount: 3000 }).success,
    ).toBe(true);
  });

  it("rejects duration < 7 (ADR-0004)", () => {
    for (const d of [0, 1, 3, 6]) {
      expect(
        challengeInputSchema.safeParse({ ...base, durationDays: d, penaltyAmount: 3000 }).success,
      ).toBe(false);
    }
  });

  it("rejects duration > 90", () => {
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 91, penaltyAmount: 3000 }).success,
    ).toBe(false);
  });

  it("accepts 0원 (없음) ~ 10,000원 penalty (D-007, #58)", () => {
    for (const v of [0, 3000, 5000, 10000]) {
      expect(
        challengeInputSchema.safeParse({ ...base, durationDays: 7, penaltyAmount: v }).success,
      ).toBe(true);
    }
  });

  it("rejects penalty over 10,000 or negative", () => {
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 7, penaltyAmount: -1000 }).success,
    ).toBe(false);
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 7, penaltyAmount: 20000 }).success,
    ).toBe(false);
  });

  it("rejects penalty not multiple of 1,000", () => {
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 7, penaltyAmount: 1500 }).success,
    ).toBe(false);
  });
});

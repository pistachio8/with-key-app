import { describe, it, expect } from "vitest";
import { challengeInputSchema } from "./challenge";

const base = {
  title: "주 3회 운동",
  type: "fitness" as const,
  goalCount: 3,
};

describe("challengeInputSchema", () => {
  it("accepts 1~90 day duration (D-006)", () => {
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 1, penaltyAmount: 1000 }).success,
    ).toBe(true);
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 7, penaltyAmount: 1000 }).success,
    ).toBe(true);
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 90, penaltyAmount: 1000 }).success,
    ).toBe(true);
  });

  it("rejects duration outside 1~90", () => {
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 0, penaltyAmount: 1000 }).success,
    ).toBe(false);
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 91, penaltyAmount: 1000 }).success,
    ).toBe(false);
  });

  it("accepts 1,000~10,000 penalty (D-007)", () => {
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 7, penaltyAmount: 1000 }).success,
    ).toBe(true);
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 7, penaltyAmount: 10000 }).success,
    ).toBe(true);
  });

  it("rejects penalty over 10,000 or under 1,000", () => {
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 7, penaltyAmount: 500 }).success,
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

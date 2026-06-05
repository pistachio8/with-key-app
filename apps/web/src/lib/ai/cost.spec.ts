import { afterEach, describe, expect, it, vi } from "vitest";
import { costMicrosToKrw, estimateCostMicros, monthlyBudgetMicros } from "./cost";

describe("cost estimation (micros)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("estimateCostMicros: 250 in + 200 out ≈ 158 micros", () => {
    expect(estimateCostMicros({ inputTokens: 250, outputTokens: 200 })).toBe(158);
  });

  it("is linear across scales", () => {
    const small = estimateCostMicros({ inputTokens: 1000, outputTokens: 500 });
    const big = estimateCostMicros({ inputTokens: 10_000, outputTokens: 5_000 });
    expect(Math.abs(big - small * 10)).toBeLessThanOrEqual(1);
  });

  it("returns 0 for zero tokens (no min-floor)", () => {
    expect(estimateCostMicros({ inputTokens: 0, outputTokens: 0 })).toBe(0);
  });

  it("costMicrosToKrw uses 1400 USD/KRW", () => {
    expect(costMicrosToKrw(1_000_000)).toBe(1400);
  });

  it("monthlyBudgetMicros reads AI_MONTHLY_BUDGET_KRW", () => {
    vi.stubEnv("AI_MONTHLY_BUDGET_KRW", "70000");
    expect(monthlyBudgetMicros()).toBe(50_000_000);
  });

  it("monthlyBudgetMicros defaults to 50000 KRW when env missing", () => {
    vi.stubEnv("AI_MONTHLY_BUDGET_KRW", "");
    expect(monthlyBudgetMicros()).toBe(35_710_000);
  });
});

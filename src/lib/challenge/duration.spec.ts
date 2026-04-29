import { describe, it, expect } from "vitest";
import { DURATION_PRESETS, MAX_DURATION_DAYS, computeEndAt } from "./duration";

describe("DURATION_PRESETS", () => {
  it("exposes 1/2/4 week presets", () => {
    expect(DURATION_PRESETS).toEqual([
      { label: "1주", days: 7 },
      { label: "2주", days: 14 },
      { label: "4주", days: 28 },
    ]);
  });

  it("caps at 90 days (D-006)", () => {
    expect(MAX_DURATION_DAYS).toBe(90);
  });
});

describe("computeEndAt", () => {
  it("adds duration_days to start (UTC-safe)", () => {
    const start = new Date("2026-04-28T00:00:00Z");
    expect(computeEndAt(start, 7).toISOString()).toBe("2026-05-05T00:00:00.000Z");
  });

  it("handles zero days as same instant", () => {
    const start = new Date("2026-04-28T09:00:00Z");
    expect(computeEndAt(start, 0).toISOString()).toBe("2026-04-28T09:00:00.000Z");
  });
});

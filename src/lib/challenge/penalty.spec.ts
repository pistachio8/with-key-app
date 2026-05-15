import { describe, it, expect } from "vitest";
import { PENALTY_PRESETS, formatKRW } from "./penalty";

describe("PENALTY_PRESETS", () => {
  it("exposes 1천 · 3천 · 5천 · 1만 (D-007 범위)", () => {
    expect(PENALTY_PRESETS).toEqual([0, 3000, 5000, 10000]);
  });
});

describe("formatKRW", () => {
  it("formats with ko-KR locale and 원 suffix", () => {
    expect(formatKRW(1000)).toBe("1,000원");
    expect(formatKRW(10000)).toBe("10,000원");
  });

  it("formats zero", () => {
    expect(formatKRW(0)).toBe("0원");
  });
});

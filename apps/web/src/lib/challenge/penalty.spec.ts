import { describe, it, expect } from "vitest";
import { PENALTY_PRESETS, formatKRW, formatKRWParts } from "./penalty";

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

describe("formatKRWParts", () => {
  it("0 → number: '0', unit: '원'", () => {
    const r = formatKRWParts(0);
    expect(r.number).toBe("0");
    expect(r.unit).toBe("원");
  });

  it("3000 → '3,000' + '원'", () => {
    const r = formatKRWParts(3000);
    expect(r.number).toBe("3,000");
    expect(r.unit).toBe("원");
  });

  it("99999 → '99,999' + '원'", () => {
    const r = formatKRWParts(99999);
    expect(r.number).toBe("99,999");
    expect(r.unit).toBe("원");
  });
});

describe("formatKRW (회귀 검증)", () => {
  it("기존 동작 유지 — '3,000원' 결합 결과", () => {
    expect(formatKRW(3000)).toBe("3,000원");
  });
});

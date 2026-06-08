import { describe, expect, it } from "vitest";
import { goalCountLabel } from "./frequency";

describe("goalCountLabel", () => {
  it("7 → '매일' (한 주에 7번 인증)", () => {
    expect(goalCountLabel(7)).toEqual({
      primary: "매일",
      helper: "한 주에 7번 인증",
      detail: "매일 1회",
    });
  });

  it("1..6 → '주 N번' / '한 주에 N번 인증' / '주 N회'", () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const { primary, helper, detail } = goalCountLabel(n);
      expect(primary).toBe(`주 ${n}번`);
      expect(helper).toBe(`한 주에 ${n}번 인증`);
      expect(detail).toBe(`주 ${n}회`);
    }
  });

  it("범위 밖 / 소수 거부", () => {
    expect(() => goalCountLabel(0)).toThrow(RangeError);
    expect(() => goalCountLabel(8)).toThrow(RangeError);
    expect(() => goalCountLabel(1.5)).toThrow(RangeError);
  });
});

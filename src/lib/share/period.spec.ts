import { describe, expect, it } from "vitest";
import { formatSharePeriod } from "./period";

describe("formatSharePeriod", () => {
  it("같은 해는 시작 연도만 표기한다", () => {
    expect(formatSharePeriod("2026-05-16T00:00:00+09:00", "2026-05-28T00:00:00+09:00")).toBe(
      "2026.5.16 – 5.28",
    );
  });

  it("해를 넘기면 양쪽 연도를 표기한다", () => {
    expect(formatSharePeriod("2025-12-28T00:00:00+09:00", "2026-01-10T00:00:00+09:00")).toBe(
      "2025.12.28 – 2026.1.10",
    );
  });

  it("한쪽이라도 null이면 빈 문자열을 반환한다", () => {
    expect(formatSharePeriod(null, "2026-05-28T00:00:00+09:00")).toBe("");
    expect(formatSharePeriod("2026-05-16T00:00:00+09:00", null)).toBe("");
  });
});

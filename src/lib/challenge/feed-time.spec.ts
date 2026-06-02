import { describe, it, expect } from "vitest";
import { formatFeedTimestamp } from "./feed-time";

// 기준 now: 2026-05-28T05:00:00Z = KST 2026-05-28 14:00:00
const NOW = new Date("2026-05-28T05:00:00Z");

describe("formatFeedTimestamp", () => {
  it("1분 미만은 '방금 전'", () => {
    expect(formatFeedTimestamp("2026-05-28T04:59:30Z", NOW)).toBe("방금 전");
    // 59초 경계 직전
    expect(formatFeedTimestamp("2026-05-28T04:59:01Z", NOW)).toBe("방금 전");
  });

  it("정확히 1분이면 '1분 전'", () => {
    expect(formatFeedTimestamp("2026-05-28T04:59:00Z", NOW)).toBe("1분 전");
  });

  it("1~59분은 'N분 전'", () => {
    expect(formatFeedTimestamp("2026-05-28T04:01:00Z", NOW)).toBe("59분 전");
  });

  it("정확히 1시간이면 '1시간 전'", () => {
    expect(formatFeedTimestamp("2026-05-28T04:00:00Z", NOW)).toBe("1시간 전");
  });

  it("1~23시간은 'N시간 전'", () => {
    // 23시간 59분 전 → 아직 24시간 미만 → "23시간 전"
    expect(formatFeedTimestamp("2026-05-27T05:01:00Z", NOW)).toBe("23시간 전");
  });

  it("정확히 24시간이면 KST 일자로 전환", () => {
    // 2026-05-27T05:00:00Z = KST 2026-05-27 14:00:00 → "5월 27일"
    expect(formatFeedTimestamp("2026-05-27T05:00:00Z", NOW)).toBe("5월 27일");
  });

  it("24시간 이상은 KST 캘린더 일자 ('M월 d일')", () => {
    // 2026-05-25T20:00:00Z = KST 2026-05-26 05:00:00 → "5월 26일"
    expect(formatFeedTimestamp("2026-05-25T20:00:00Z", NOW)).toBe("5월 26일");
  });

  it("KST 자정 경계가 일자 표기에 반영된다", () => {
    // 2026-05-25T15:00:00Z = KST 2026-05-26 00:00:00 → "5월 26일"
    expect(formatFeedTimestamp("2026-05-25T15:00:00Z", NOW)).toBe("5월 26일");
    // 2026-05-25T14:59:59Z = KST 2026-05-25 23:59:59 → "5월 25일"
    expect(formatFeedTimestamp("2026-05-25T14:59:59Z", NOW)).toBe("5월 25일");
  });

  it("시계 오차로 created 가 미래면 '방금 전'", () => {
    expect(formatFeedTimestamp("2026-05-28T05:05:00Z", NOW)).toBe("방금 전");
  });
});

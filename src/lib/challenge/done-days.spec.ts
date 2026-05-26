import { describe, it, expect } from "vitest";
import { countDoneDaysByUser, toKstDayKey } from "./done-days";

describe("toKstDayKey", () => {
  it("KST 자정 직전 (UTC 14:59:59) 은 그 날짜", () => {
    // 2026-05-26T14:59:59Z = KST 2026-05-26 23:59:59 → "2026-05-26"
    expect(toKstDayKey("2026-05-26T14:59:59Z")).toBe("2026-05-26");
  });

  it("KST 자정 (UTC 15:00:00) 부터는 다음 날짜", () => {
    // 2026-05-26T15:00:00Z = KST 2026-05-27 00:00:00 → "2026-05-27"
    expect(toKstDayKey("2026-05-26T15:00:00Z")).toBe("2026-05-27");
  });

  it("Date 인스턴스도 그대로 수용", () => {
    expect(toKstDayKey(new Date("2026-05-26T00:00:00Z"))).toBe("2026-05-26");
  });
});

describe("countDoneDaysByUser", () => {
  it("같은 날 N개 피드 → 1로 카운트", () => {
    const logs = [
      { user_id: "u-a", created_at: "2026-05-26T00:00:00Z" }, // KST 09:00
      { user_id: "u-a", created_at: "2026-05-26T10:00:00Z" }, // KST 19:00
      { user_id: "u-a", created_at: "2026-05-26T13:00:00Z" }, // KST 22:00
    ];
    const counts = countDoneDaysByUser(logs);
    expect(counts.get("u-a")).toBe(1);
  });

  it("다른 사용자 같은 날 → 각자 1", () => {
    const logs = [
      { user_id: "u-a", created_at: "2026-05-26T00:00:00Z" },
      { user_id: "u-b", created_at: "2026-05-26T10:00:00Z" },
      { user_id: "u-b", created_at: "2026-05-26T11:00:00Z" },
    ];
    const counts = countDoneDaysByUser(logs);
    expect(counts.get("u-a")).toBe(1);
    expect(counts.get("u-b")).toBe(1);
  });

  it("같은 사용자 다른 날 → 각 날짜 카운트", () => {
    const logs = [
      { user_id: "u-a", created_at: "2026-05-26T01:00:00Z" },
      { user_id: "u-a", created_at: "2026-05-27T01:00:00Z" },
      { user_id: "u-a", created_at: "2026-05-28T01:00:00Z" },
    ];
    const counts = countDoneDaysByUser(logs);
    expect(counts.get("u-a")).toBe(3);
  });

  it("KST 자정 경계 — UTC 같은 날이지만 KST 다른 날 → 2", () => {
    const logs = [
      { user_id: "u-a", created_at: "2026-05-26T14:59:59Z" }, // KST 2026-05-26
      { user_id: "u-a", created_at: "2026-05-26T15:00:00Z" }, // KST 2026-05-27
    ];
    const counts = countDoneDaysByUser(logs);
    expect(counts.get("u-a")).toBe(2);
  });

  it("빈 입력 → 빈 Map", () => {
    expect(countDoneDaysByUser([]).size).toBe(0);
  });

  it("로그에 없는 user_id 조회 → undefined", () => {
    const counts = countDoneDaysByUser([{ user_id: "u-a", created_at: "2026-05-26T00:00:00Z" }]);
    expect(counts.get("u-z")).toBeUndefined();
  });
});

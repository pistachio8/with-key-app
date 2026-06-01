import { describe, it, expect } from "vitest";
import { formatPledgeDateRange } from "./pledge-date-range";

describe("formatPledgeDateRange", () => {
  describe("pending/accepted (end_at NULL) — 오늘 시작 가정 추정치", () => {
    it("7일: 오늘(KST 6/1) ~ 6/7, isEstimate=true (8일 버그 회귀 방지)", () => {
      // 2026-06-01T05:00:00Z = KST 2026-06-01 14:00
      const r = formatPledgeDateRange({
        durationDays: 7,
        startAt: null,
        endAt: null,
        now: new Date("2026-06-01T05:00:00Z"),
      });
      expect(r.text).toBe("6/1 ~ 6/7");
      expect(r.isEstimate).toBe(true);
    });

    it("14일: 오늘 ~ 오늘+13 (6/1 ~ 6/14)", () => {
      const r = formatPledgeDateRange({
        durationDays: 14,
        startAt: null,
        endAt: null,
        now: new Date("2026-06-01T05:00:00Z"),
      });
      expect(r.text).toBe("6/1 ~ 6/14");
      expect(r.isEstimate).toBe(true);
    });

    it("KST 자정 경계: UTC 15:00 부터는 다음 날짜로 시작일이 넘어간다", () => {
      // 2026-05-31T15:00:00Z = KST 2026-06-01 00:00
      const r = formatPledgeDateRange({
        durationDays: 7,
        startAt: null,
        endAt: null,
        now: new Date("2026-05-31T15:00:00Z"),
      });
      expect(r.text).toBe("6/1 ~ 6/7");
    });

    it("KST 자정 직전(UTC 14:59:59)은 아직 그 전날 기준", () => {
      // 2026-05-31T14:59:59Z = KST 2026-05-31 23:59:59
      const r = formatPledgeDateRange({
        durationDays: 7,
        startAt: null,
        endAt: null,
        now: new Date("2026-05-31T14:59:59Z"),
      });
      expect(r.text).toBe("5/31 ~ 6/6");
    });

    it("startAt 만 있고 endAt NULL 이어도 추정 분기로 폴백", () => {
      const r = formatPledgeDateRange({
        durationDays: 7,
        startAt: "2026-05-30T10:19:34Z",
        endAt: null,
        now: new Date("2026-06-01T05:00:00Z"),
      });
      expect(r.isEstimate).toBe(true);
      expect(r.text).toBe("6/1 ~ 6/7");
    });
  });

  describe("active/closed (start_at·end_at 존재) — 실제 날짜", () => {
    it("ADR-0026 자정 end_at: 마지막 인증일 = end_at KST 일자 − 1일", () => {
      // start KST 5/30 19:19, end_at = 6/6 00:00 KST(=2026-06-05T15:00:00Z)
      // → 마지막 인증일 6/5 → "5/30 ~ 6/5"  (b088ae54 "이번 주 운동 서약서" 케이스)
      const r = formatPledgeDateRange({
        durationDays: 7,
        startAt: "2026-05-30T10:19:34Z",
        endAt: "2026-06-05T15:00:00Z",
        now: new Date("2026-06-01T05:00:00Z"),
      });
      expect(r.text).toBe("5/30 ~ 6/5");
      expect(r.isEstimate).toBe(false);
    });

    it("closed: 실제 시작·종료 날짜 그대로 (now 무관)", () => {
      // start KST 5/20, end_at = 5/27 00:00 KST(=2026-05-26T15:00:00Z) → 마지막 5/26
      const r = formatPledgeDateRange({
        durationDays: 7,
        startAt: "2026-05-20T01:00:00Z",
        endAt: "2026-05-26T15:00:00Z",
        now: new Date("2026-09-09T00:00:00Z"),
      });
      expect(r.text).toBe("5/20 ~ 5/26");
      expect(r.isEstimate).toBe(false);
    });

    it("월 경계: start KST 1/30, end_at 2/6 자정 → 1/30 ~ 2/5", () => {
      const r = formatPledgeDateRange({
        durationDays: 7,
        startAt: "2026-01-29T15:00:00Z", // KST 1/30 00:00
        endAt: "2026-02-05T15:00:00Z", // KST 2/6 00:00 → 마지막 2/5
        now: new Date("2026-02-01T00:00:00Z"),
      });
      expect(r.text).toBe("1/30 ~ 2/5");
    });
  });
});

import { describe, it, expect } from "vitest";
import { challengePhase, isChallengeOver, remainingDays } from "./lifecycle";

// ADR-0027 — "진행 vs 종료" 판정 SoT. end_at <= now 가 over 의 기준.
const HOUR = 3_600_000;
const DAY = 86_400_000;

describe("challengePhase", () => {
  const now = Date.UTC(2026, 4, 30, 0, 0, 0); // 고정 기준 시각

  it("status='closed' 는 endAt 무관 항상 'closed'", () => {
    expect(challengePhase("closed", null, now)).toBe("closed");
    expect(challengePhase("closed", new Date(now + DAY).toISOString(), now)).toBe("closed");
  });

  it("pending/accepted 는 그대로 통과", () => {
    expect(challengePhase("pending", null, now)).toBe("pending");
    expect(challengePhase("accepted", null, now)).toBe("accepted");
  });

  it("active + 미래 end_at → 'running'", () => {
    expect(challengePhase("active", new Date(now + DAY).toISOString(), now)).toBe("running");
    expect(challengePhase("active", new Date(now + 1).toISOString(), now)).toBe("running");
  });

  it("active + end_at == now → 'over' (경계 포함, <=)", () => {
    expect(challengePhase("active", new Date(now).toISOString(), now)).toBe("over");
  });

  it("active + 과거 end_at → 'over'", () => {
    expect(challengePhase("active", new Date(now - HOUR).toISOString(), now)).toBe("over");
  });

  it("active + end_at=null → 'running' (이론상 미발생 — 활성화가 atomic set)", () => {
    expect(challengePhase("active", null, now)).toBe("running");
  });
});

describe("isChallengeOver", () => {
  const now = Date.UTC(2026, 4, 30, 0, 0, 0);

  it("closed · over 는 true", () => {
    expect(isChallengeOver("closed", null, now)).toBe(true);
    expect(isChallengeOver("active", new Date(now - HOUR).toISOString(), now)).toBe(true);
    expect(isChallengeOver("active", new Date(now).toISOString(), now)).toBe(true);
  });

  it("running · pending · accepted 는 false", () => {
    expect(isChallengeOver("active", new Date(now + DAY).toISOString(), now)).toBe(false);
    expect(isChallengeOver("pending", null, now)).toBe(false);
    expect(isChallengeOver("accepted", null, now)).toBe(false);
  });
});

describe("remainingDays", () => {
  const now = Date.UTC(2026, 4, 30, 0, 0, 0);

  it("end_at=null → 0", () => {
    expect(remainingDays(null, now)).toBe(0);
  });

  it("마지막 날(자정까지 <1일 남음) → 1 (D-1, 클램프 없음)", () => {
    expect(remainingDays(new Date(now + HOUR).toISOString(), now)).toBe(1);
  });

  it("7일 남음 → 7", () => {
    expect(remainingDays(new Date(now + 7 * DAY).toISOString(), now)).toBe(7);
  });

  it("만료(end_at 지남) → 0 이하 (클램프하지 않음 — 호출처가 running 일 때만 렌더)", () => {
    expect(remainingDays(new Date(now).toISOString(), now)).toBe(0);
    expect(remainingDays(new Date(now - HOUR).toISOString(), now)).toBeLessThanOrEqual(0);
  });
});

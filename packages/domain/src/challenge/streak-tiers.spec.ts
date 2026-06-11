import { describe, it, expect } from "vitest";
import { streakTiers } from "./streak-tiers";

describe("streakTiers", () => {
  it("연속 인증은 매일 한 단계씩 깊어진다", () => {
    const t = streakTiers([1, 2, 3], 5);
    expect(t.get(1)).toBe(1);
    expect(t.get(2)).toBe(2);
    expect(t.get(3)).toBe(3);
  });

  it("미인증 일자는 0", () => {
    const t = streakTiers([1, 2], 4);
    expect(t.get(3)).toBe(0);
    expect(t.get(4)).toBe(0);
  });

  it("끊기면 streak 가 1 로 리셋된다", () => {
    const t = streakTiers([1, 2, 4], 4);
    expect(t.get(2)).toBe(2);
    expect(t.get(3)).toBe(0);
    expect(t.get(4)).toBe(1);
  });

  it("7일 초과는 7 로 평탄화", () => {
    const t = streakTiers([1, 2, 3, 4, 5, 6, 7, 8, 9], 9);
    expect(t.get(7)).toBe(7);
    expect(t.get(8)).toBe(7);
    expect(t.get(9)).toBe(7);
  });

  it("빈 목록은 전부 0, 키는 1..totalDays", () => {
    const t = streakTiers([], 3);
    expect(t.size).toBe(3);
    expect([...t.values()]).toEqual([0, 0, 0]);
  });

  it("범위 밖/중복 인증일은 무시(Set)", () => {
    const t = streakTiers([1, 1, 99], 3);
    expect(t.get(1)).toBe(1);
    expect(t.get(2)).toBe(0);
    expect(t.has(99)).toBe(false);
  });
});

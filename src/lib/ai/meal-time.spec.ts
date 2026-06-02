import { describe, expect, it } from "vitest";
import { inferMealSlot, type MealSlot } from "./meal-time";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// KST wall-clock 2026-05-28 HH:MM 을 epoch ms 로 변환 (서버 UTC 기준 instant).
function kst(hour: number, minute = 0): number {
  return Date.UTC(2026, 4, 28, hour, minute) - KST_OFFSET_MS;
}

describe("inferMealSlot", () => {
  it.each<[number, number, MealSlot]>([
    [4, 59, "야식"],
    [5, 0, "아침"],
    [10, 59, "아침"],
    [11, 0, "점심"],
    [16, 59, "점심"],
    [17, 0, "저녁"],
    [21, 59, "저녁"],
    [22, 0, "야식"],
    [0, 0, "야식"], // 자정
    [3, 0, "야식"],
  ])("KST %i:%i → %s", (h, m, expected) => {
    expect(inferMealSlot(kst(h, m))).toBe(expected);
  });

  it("UTC 02:00 instant 을 KST 11:00(점심) 으로 변환한다 (offset +9 검증)", () => {
    // 서버(Vercel)는 UTC. UTC 02:00 == KST 11:00 → 점심.
    expect(inferMealSlot(Date.UTC(2026, 4, 28, 2, 0))).toBe("점심");
  });
});

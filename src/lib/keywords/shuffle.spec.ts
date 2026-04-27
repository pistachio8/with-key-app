import { describe, expect, it } from "vitest";
import { KEYWORD_POOL } from "./pool";
import { REROLL_LIMIT, canReroll, initialShuffle, reroll } from "./shuffle";

// 결정적 RNG — 테스트 재현성을 위해 고정 시드 대체.
function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

describe("keywords/shuffle", () => {
  it("initial shuffle returns 6~9 distinct keywords from the activity pool", () => {
    const rng = seededRng(42);
    const state = initialShuffle("gym", rng);
    const pool = KEYWORD_POOL.gym;

    expect(state.shown.length).toBeGreaterThanOrEqual(6);
    expect(state.shown.length).toBeLessThanOrEqual(9);
    expect(new Set(state.shown).size).toBe(state.shown.length); // 비복원
    state.shown.forEach((kw) => expect(pool).toContain(kw));
    expect(state.rerollCount).toBe(0);
  });

  it("reroll increments rerollCount and produces a new shown set", () => {
    const rng = seededRng(7);
    const first = initialShuffle("running", rng);
    const second = reroll(first, rng);

    expect(second.rerollCount).toBe(1);
    expect(second.shown.length).toBeGreaterThanOrEqual(6);
    expect(new Set(second.shown).size).toBe(second.shown.length);
  });

  it("reroll is blocked after REROLL_LIMIT", () => {
    const rng = seededRng(1);
    let state = initialShuffle("yoga", rng);
    for (let i = 0; i < REROLL_LIMIT; i++) {
      state = reroll(state, rng);
    }
    expect(state.rerollCount).toBe(REROLL_LIMIT);
    expect(canReroll(state)).toBe(false);

    const afterCap = reroll(state, rng);
    expect(afterCap.rerollCount).toBe(REROLL_LIMIT);
    expect(afterCap.shown).toEqual(state.shown);
  });
});

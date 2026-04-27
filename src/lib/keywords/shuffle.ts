import { KEYWORD_POOL, type ActivityType } from "./pool";

export const REROLL_LIMIT = 5;
export const SHOWN_MIN = 6;
export const SHOWN_MAX = 9;

export type ShuffleState = {
  activityType: ActivityType;
  shown: string[];
  rerollCount: number;
};

function pickWithoutReplacement<T>(source: readonly T[], n: number, rng: () => number): T[] {
  const arr = source.slice();
  const picked: T[] = [];
  const count = Math.min(n, arr.length);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng() * arr.length);
    picked.push(arr[idx]);
    arr.splice(idx, 1);
  }
  return picked;
}

function targetCount(poolSize: number, rng: () => number): number {
  const max = Math.min(SHOWN_MAX, poolSize);
  if (poolSize <= SHOWN_MIN) return poolSize;
  return SHOWN_MIN + Math.floor(rng() * (max - SHOWN_MIN + 1));
}

export function initialShuffle(
  activityType: ActivityType,
  rng: () => number = Math.random,
): ShuffleState {
  const pool = KEYWORD_POOL[activityType];
  const n = targetCount(pool.length, rng);
  return {
    activityType,
    shown: pickWithoutReplacement(pool, n, rng),
    rerollCount: 0,
  };
}

export function reroll(state: ShuffleState, rng: () => number = Math.random): ShuffleState {
  if (state.rerollCount >= REROLL_LIMIT) return state;
  const pool = KEYWORD_POOL[state.activityType];
  const n = targetCount(pool.length, rng);
  return {
    ...state,
    shown: pickWithoutReplacement(pool, n, rng),
    rerollCount: state.rerollCount + 1,
  };
}

export function canReroll(state: ShuffleState): boolean {
  return state.rerollCount < REROLL_LIMIT;
}

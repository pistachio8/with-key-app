// src/lib/share/seeded-pick.ts
// 결정적 PRNG(mulberry32) — 같은 seed면 같은 결과. 공유물 사진 선택을
// 미리보기와 실제 공유 파일에서 동일하게 만들기 위함(스펙 D-E).

/** 32-bit 정수 seed → [0,1) 의사난수 생성기. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** seed 로 배열에서 1개를 결정적으로 고른다. 빈 배열이면 null. */
export function pickOne<T>(arr: ReadonlyArray<T>, seed: number): T | null {
  if (arr.length === 0) return null;
  const rng = mulberry32(seed);
  return arr[Math.floor(rng() * arr.length)];
}

/** seed 로 배열을 결정적으로 섞어(Fisher–Yates) 앞 n개를 돌려준다. 원본 불변. */
export function sample<T>(arr: ReadonlyArray<T>, n: number, seed: number): T[] {
  const rng = mulberry32(seed);
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, n));
}

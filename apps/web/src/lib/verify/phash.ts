import "server-only";
import sharp from "sharp";

// 64-bit DCT perceptual hash (Zauner pHash 레시피).
// grayscale → 32×32 resize → 2D DCT-II → 좌상단 8×8 저주파 → DC 제외 median 임계 → 64비트.
// 동일 이미지 → 동일 hash 가 결정론 불변식이며, EVAL-0022 의 θ(해밍 6/10)는 이 64비트 기준이다.
// 비트수/알고리즘을 바꾸면 θ 재도출이 필요하므로 상수를 함부로 바꾸지 않는다(false-flag-threshold-theta spec §판정 매핑).

const DCT_SIZE = 32; // resize 대상 정사각 변
const LOW_FREQ = 8; // 저주파 8×8 → 64비트
export const PHASH_HEX_LEN = 16; // 64비트 = 16 hex
export const PHASH_BITS = LOW_FREQ * LOW_FREQ;

// cos[(2i+1)·k·π / 2N] 룩업 — k 는 저주파 인덱스(0..7), i 는 픽셀 좌표(0..31).
const COS = (() => {
  const table: number[][] = [];
  for (let k = 0; k < LOW_FREQ; k++) {
    const row = new Array<number>(DCT_SIZE);
    for (let i = 0; i < DCT_SIZE; i++) {
      row[i] = Math.cos(((2 * i + 1) * k * Math.PI) / (2 * DCT_SIZE));
    }
    table.push(row);
  }
  return table;
})();

// DCT-II 정규화 계수 α(0)=√(1/N), α(k>0)=√(2/N). median 비교 전 상대 크기에 영향을 주므로 포함한다.
const ALPHA = (() => {
  const a = new Array<number>(LOW_FREQ);
  a[0] = Math.sqrt(1 / DCT_SIZE);
  for (let k = 1; k < LOW_FREQ; k++) a[k] = Math.sqrt(2 / DCT_SIZE);
  return a;
})();

/**
 * 순수 함수: row-major grayscale 픽셀(size×size)에서 64비트 DCT pHash(16 hex)를 계산한다.
 * sharp 없이 합성 픽셀로 결정론을 단위 테스트할 수 있게 분리했다.
 */
export function dctPhash(pixels: readonly number[], size = DCT_SIZE): string {
  if (pixels.length !== size * size) {
    throw new Error(`dctPhash expects ${size * size} pixels, got ${pixels.length}`);
  }
  if (size !== DCT_SIZE) {
    // COS/ALPHA 룩업이 DCT_SIZE 에 고정 — 다른 변을 쓰려면 룩업 재생성이 필요하다.
    throw new Error(`dctPhash only supports size=${DCT_SIZE}`);
  }

  // 저주파 8×8 계수만 계산한다(64 × 32×32). f[x][y] = pixels[x*size + y].
  const coeffs = new Array<number>(PHASH_BITS);
  for (let u = 0; u < LOW_FREQ; u++) {
    for (let v = 0; v < LOW_FREQ; v++) {
      let sum = 0;
      for (let x = 0; x < size; x++) {
        const cux = COS[u][x];
        const base = x * size;
        let inner = 0;
        for (let y = 0; y < size; y++) {
          inner += pixels[base + y] * COS[v][y];
        }
        sum += cux * inner;
      }
      coeffs[u * LOW_FREQ + v] = ALPHA[u] * ALPHA[v] * sum;
    }
  }

  // DC(0,0) 제외 median 을 임계로 — DC 는 평균 밝기라 분포를 왜곡한다.
  const sortable = coeffs.slice(1).sort((a, b) => a - b);
  const mid = sortable.length >> 1;
  const median =
    sortable.length % 2 === 0 ? (sortable[mid - 1] + sortable[mid]) / 2 : sortable[mid];

  // u 외측 · v 내측, MSB=(0,0). 64비트를 nibble(4비트) 단위로 16 hex 조립(BigInt 회피, ES2017 target).
  let hex = "";
  for (let i = 0; i < PHASH_BITS; i += 4) {
    let nibble = 0;
    for (let j = 0; j < 4; j++) {
      nibble = (nibble << 1) | (coeffs[i + j] > median ? 1 : 0);
    }
    hex += nibble.toString(16);
  }
  return hex;
}

/** sharp 전처리(grayscale·32×32) 후 dctPhash. 동일 이미지 → 동일 hash(결정론). */
export async function computePhash(image: Buffer | Uint8Array): Promise<string> {
  const raw = await sharp(image)
    .greyscale()
    .resize(DCT_SIZE, DCT_SIZE, { fit: "fill" })
    .raw()
    .toBuffer();
  return dctPhash(Array.from(raw), DCT_SIZE);
}

const HEX_RE = /^[0-9a-f]{16}$/i;
// nibble(0..15) popcount 룩업 — BigInt 없이 16 hex 를 nibble 단위로 비교.
const NIBBLE_POPCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/** 두 64비트 phash(16 hex)의 해밍거리(다른 비트 수, 0..64). */
export function hammingDistance(a: string, b: string): number {
  if (!HEX_RE.test(a) || !HEX_RE.test(b)) {
    throw new Error("hammingDistance expects two 16-hex (64-bit) phashes");
  }
  let count = 0;
  for (let i = 0; i < PHASH_HEX_LEN; i++) {
    count += NIBBLE_POPCOUNT[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  }
  return count;
}

// ── phash 중복 매칭(순수) — DB read 가 candidate 를 채워 호출한다 ──────────────
// θ(해밍 6/10)·scope 행동 매핑은 EVAL-0022 가 적용한다. 여기서는 거리·최근접·정확중복만 제공.

export interface PhashCandidate {
  actionLogId: string;
  userId: string;
  phash: string;
}

export interface PhashMatch {
  actionLogId: string;
  userId: string;
  distance: number;
}

export interface PhashDuplicateResult {
  /** 거리 오름차순 매치 전체(θ 적용 전 raw 입력). */
  matches: PhashMatch[];
  /** 최근접 매치(없으면 null). */
  nearest: PhashMatch | null;
  /** 동일 phash(거리 0) 존재 여부 — θ 무관 결정론 중복 플래그. */
  exactDuplicate: boolean;
}

/**
 * 순수: target phash 와 candidate prior phash 들의 거리를 계산해 정렬·최근접·정확중복을 돌려준다.
 * "동일 phash → exactDuplicate=true" 가 결정론 중복 불변식(거리 0, θ 비의존).
 */
export function findPhashDuplicates(
  targetPhash: string,
  candidates: readonly PhashCandidate[],
): PhashDuplicateResult {
  const matches = candidates
    .map((c) => ({
      actionLogId: c.actionLogId,
      userId: c.userId,
      distance: hammingDistance(targetPhash, c.phash),
    }))
    .sort((a, b) => a.distance - b.distance);
  return {
    matches,
    nearest: matches[0] ?? null,
    exactDuplicate: matches.some((m) => m.distance === 0),
  };
}

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  computePhash,
  dctPhash,
  findPhashDuplicates,
  hammingDistance,
  PHASH_HEX_LEN,
} from "./phash";

// 결정론 픽셀 생성 — seed 로 재현 가능한 gradient raw RGB → PNG.
function gradientPng(width: number, height: number, seed: number): Promise<Buffer> {
  const buf = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      buf[i] = (x * seed) % 256;
      buf[i + 1] = (y * seed) % 256;
      buf[i + 2] = ((x + y) * seed) % 256;
    }
  }
  return sharp(buf, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

// 결정론 grayscale 픽셀 1024개(seed 기반).
function pixels(seed: number): number[] {
  const out = new Array<number>(32 * 32);
  for (let i = 0; i < out.length; i++) out[i] = (i * seed * 7 + seed) % 256;
  return out;
}

describe("dctPhash (순수)", () => {
  it("동일 입력 → 동일 hash (결정론 불변식)", () => {
    const p = pixels(3);
    expect(dctPhash(p)).toBe(dctPhash(p.slice()));
  });

  it("16 hex(64비트) 형식", () => {
    expect(dctPhash(pixels(5))).toMatch(/^[0-9a-f]{16}$/);
    expect(dctPhash(pixels(5))).toHaveLength(PHASH_HEX_LEN);
  });

  it("다른 입력 → 다른 hash", () => {
    expect(dctPhash(pixels(2))).not.toBe(dctPhash(pixels(9)));
  });

  it("픽셀 수가 틀리면 throw", () => {
    expect(() => dctPhash([1, 2, 3])).toThrow();
  });
});

describe("computePhash (sharp)", () => {
  it("동일 이미지 → 동일 hash, 2회 호출 일치 (결정론 불변식)", async () => {
    const png = await gradientPng(96, 96, 4);
    const a = await computePhash(png);
    const b = await computePhash(png);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("변형 이미지 → 해밍거리 > 0 (변형 측정 가능)", async () => {
    const base = await computePhash(await gradientPng(96, 96, 4));
    const other = await computePhash(await gradientPng(96, 96, 40));
    expect(hammingDistance(base, other)).toBeGreaterThan(0);
  });

  it("재인코딩(PNG→JPEG)에도 동일 이미지는 근접 (perceptual 견고)", async () => {
    const png = await gradientPng(128, 128, 6);
    const jpeg = await sharp(png).jpeg({ quality: 80 }).toBuffer();
    expect(hammingDistance(await computePhash(png), await computePhash(jpeg))).toBeLessThanOrEqual(
      6,
    );
  });
});

describe("hammingDistance", () => {
  it("동일 hash → 0", () => {
    expect(hammingDistance("0123456789abcdef", "0123456789abcdef")).toBe(0);
  });

  it("1비트 차 → 1, 전체 반전 → 64", () => {
    expect(hammingDistance("0000000000000000", "0000000000000001")).toBe(1);
    expect(hammingDistance("0000000000000000", "ffffffffffffffff")).toBe(64);
  });

  it("16 hex 아니면 throw", () => {
    expect(() => hammingDistance("abc", "def")).toThrow();
  });
});

describe("findPhashDuplicates (순수 매처)", () => {
  const target = "0123456789abcdef";

  it("동일 phash 후보 → exactDuplicate=true, 최근접 거리 0 (중복 플래그 불변식)", () => {
    const r = findPhashDuplicates(target, [
      { actionLogId: "a1", userId: "u1", phash: target },
      { actionLogId: "a2", userId: "u2", phash: "ffffffffffffffff" },
    ]);
    expect(r.exactDuplicate).toBe(true);
    expect(r.nearest?.distance).toBe(0);
    expect(r.nearest?.actionLogId).toBe("a1");
    expect(r.matches).toHaveLength(2);
    // 거리 오름차순 정렬
    expect(r.matches[0].distance).toBeLessThanOrEqual(r.matches[1].distance);
  });

  it("동일 phash 없음 → exactDuplicate=false", () => {
    const r = findPhashDuplicates(target, [
      { actionLogId: "a2", userId: "u2", phash: "ffffffffffffffff" },
    ]);
    expect(r.exactDuplicate).toBe(false);
    expect(r.nearest?.distance).toBeGreaterThan(0);
  });

  it("후보 없음 → 빈 결과", () => {
    const r = findPhashDuplicates(target, []);
    expect(r).toEqual({ matches: [], nearest: null, exactDuplicate: false });
  });
});

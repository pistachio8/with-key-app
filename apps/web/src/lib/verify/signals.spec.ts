import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  advisorySignalScore,
  computeVerifySignals,
  SIGNAL_MODEL_VERSION,
  type VerifySignals,
} from "./signals";

function jpeg(seed: number): Promise<Buffer> {
  return sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: seed, g: seed, b: seed } },
  })
    .jpeg()
    .toBuffer();
}

describe("computeVerifySignals (집계 결정론)", () => {
  it("동일 입력 → 동일 신호 (결정론 불변식)", async () => {
    const buf = await jpeg(42);
    const a = await computeVerifySignals(buf);
    const b = await computeVerifySignals(buf);
    expect(a).toEqual(b);
    expect(a.phash).toMatch(/^[0-9a-f]{16}$/);
    expect(a.modelVersion).toBe(SIGNAL_MODEL_VERSION);
  });

  it("EXIF 없는 사진 → capturedAt=null, captureToSubmitMs=null", async () => {
    const s = await computeVerifySignals(await jpeg(10));
    expect(s.capturedAt).toBeNull();
    expect(s.captureToSubmitMs).toBeNull();
  });

  it("EXIF 촬영시각 + submittedAt → 촬영-제출 간격 계산", async () => {
    const captured = "2026:06:05 10:00:00";
    const buf = await sharp({
      create: { width: 48, height: 48, channels: 3, background: { r: 3, g: 3, b: 3 } },
    })
      .jpeg()
      .withExif({ IFD0: { Make: "Apple", DateTime: captured } })
      .toBuffer();

    const submittedAt = new Date("2026-06-05T10:05:00Z");
    const s = await computeVerifySignals(buf, { submittedAt });
    expect(s.capturedAt?.toISOString()).toBe("2026-06-05T10:00:00.000Z");
    expect(s.captureToSubmitMs).toBe(5 * 60 * 1000);
  });
});

describe("advisorySignalScore", () => {
  const base: VerifySignals = {
    phash: "0000000000000000",
    capturedAt: null,
    exifPresent: true,
    cameraExifPresent: true,
    screenshot: { suspected: false, reasons: [] },
    captureToSubmitMs: null,
    modelVersion: SIGNAL_MODEL_VERSION,
  };

  it("청정 → 0", () => {
    expect(advisorySignalScore(base)).toBe(0);
  });

  it("EXIF 부재 → +1", () => {
    expect(advisorySignalScore({ ...base, exifPresent: false })).toBe(1);
  });

  it("EXIF 부재 + 스크린샷 의심 → 2", () => {
    expect(
      advisorySignalScore({
        ...base,
        exifPresent: false,
        screenshot: { suspected: true, reasons: ["no-camera-exif", "device-screen-dimensions"] },
      }),
    ).toBe(2);
  });
});

import { describe, expect, it } from "vitest";
import { computeLaplacianVariance, judgePhotoPrecheck, precheckPhotoFile } from "./precheck";

function rgbaFromLuma(width: number, height: number, lumaAt: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const value = lumaAt(x, y);
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe("photo precheck blur heuristic", () => {
  it("flat/blurred pixels produce a retake recommendation", () => {
    const flat = rgbaFromLuma(8, 8, () => 128);
    const variance = computeLaplacianVariance(flat, 8, 8);
    const result = judgePhotoPrecheck({
      width: 1440,
      height: 1080,
      blurVariance: variance,
      cameraExifPresent: false,
      exifPresent: false,
    });

    expect(result.shouldRetake).toBe(true);
    expect(result.reasons).toContain("blurry");
    // 신호 독립성: 1440×1080 은 단말 해상도 목록에 없어 screenshot 격리.
    expect(result.screenshot.suspected).toBe(false);
  });

  it("high-frequency pixels do not trip the blur threshold", () => {
    const checker = rgbaFromLuma(8, 8, (x, y) => ((x + y) % 2 === 0 ? 0 : 255));
    const variance = computeLaplacianVariance(checker, 8, 8);
    const result = judgePhotoPrecheck({
      width: 1440,
      height: 1080,
      blurVariance: variance,
      cameraExifPresent: false,
      exifPresent: false,
    });

    expect(result.shouldRetake).toBe(false);
    expect(result.reasons).not.toContain("blurry");
    expect(result.screenshot.suspected).toBe(false);
  });
});

describe("photo precheck screenshot heuristic", () => {
  it("reuses the EVAL-0021 screenshot detector for device-resolution screenshots", () => {
    const result = judgePhotoPrecheck({
      width: 1170,
      height: 2532,
      blurVariance: 500,
      cameraExifPresent: false,
      exifPresent: false,
    });

    expect(result.shouldRetake).toBe(true);
    expect(result.reasons).toContain("screenshot");
    expect(result.screenshot.reasons).toContain("device-screen-dimensions");
    // 신호 독립성: variance 500 > 80 → blur 격리.
    expect(result.blur.suspected).toBe(false);
  });

  it("flags a camera original at device resolution — intended advisory false-flag", () => {
    // PWA precheck 은 브라우저에서 server-only sharp EXIF 파서를 쓸 수 없어
    // cameraExifPresent 를 항상 false 로 둔다. 그래서 단말 풀스크린 해상도와 일치하는
    // 정상 카메라 원본도 screenshot 으로 의심된다. 비차단 권고이므로 의도된 동작.
    const result = judgePhotoPrecheck({
      width: 1179,
      height: 2556, // iPhone 14 Pro/15 — SCREEN_RESOLUTIONS 등재
      blurVariance: 500,
      cameraExifPresent: false,
      exifPresent: false,
    });

    expect(result.shouldRetake).toBe(true);
    expect(result.reasons).toEqual(["screenshot"]);
  });

  it("keeps unsupported browser decoding non-blocking", async () => {
    // node 환경: createImageBitmap guard 경로만 검증 — canvas I/O(readSample →
    // computeLaplacianVariance) 실경로는 jsdom/node 에서 실행되지 않는다.
    const result = await precheckPhotoFile(new Blob(["not-an-image"]));

    expect(result.shouldRetake).toBe(false);
    expect(result.reasons).toEqual([]);
  });
});

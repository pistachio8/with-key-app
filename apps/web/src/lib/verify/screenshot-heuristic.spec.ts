import { describe, expect, it } from "vitest";
import { detectScreenshot } from "./screenshot-heuristic";

describe("detectScreenshot (순수·결정론)", () => {
  it("카메라 EXIF 부재 + 단말 해상도 → suspected=true", () => {
    const r = detectScreenshot({
      cameraExifPresent: false,
      exifPresent: false,
      width: 1170,
      height: 2532,
    });
    expect(r.suspected).toBe(true);
    expect(r.reasons).toContain("no-camera-exif");
    expect(r.reasons).toContain("device-screen-dimensions");
  });

  it("세로/가로 무관 해상도 매칭", () => {
    expect(
      detectScreenshot({ cameraExifPresent: false, exifPresent: false, width: 2556, height: 1179 })
        .suspected,
    ).toBe(true);
  });

  it("카메라 EXIF 존재 → suspected=false (단말 해상도여도)", () => {
    const r = detectScreenshot({
      cameraExifPresent: true,
      exifPresent: true,
      width: 1170,
      height: 2532,
    });
    expect(r.suspected).toBe(false);
  });

  it("EXIF 없지만 단말 해상도 아님 → suspected=false (리사이즈 정상사진 오발 방지)", () => {
    const r = detectScreenshot({
      cameraExifPresent: false,
      exifPresent: false,
      width: 1920,
      height: 1440,
    });
    expect(r.suspected).toBe(false);
    expect(r.reasons).toContain("no-camera-exif");
    expect(r.reasons).not.toContain("device-screen-dimensions");
  });

  it("크기 미상 → suspected=false", () => {
    expect(
      detectScreenshot({ cameraExifPresent: false, exifPresent: false, width: null, height: null })
        .suspected,
    ).toBe(false);
  });

  it("동일 입력 → 동일 출력 (결정론)", () => {
    const input = { cameraExifPresent: false, exifPresent: false, width: 1284, height: 2778 };
    expect(detectScreenshot(input)).toEqual(detectScreenshot({ ...input }));
  });
});

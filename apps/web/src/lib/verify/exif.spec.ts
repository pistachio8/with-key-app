import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { extractExifSignals, hasCameraExif, selectCapturedAt } from "./exif";

describe("selectCapturedAt (순수)", () => {
  const dto = new Date("2026-06-05T10:00:00Z");
  const dtd = new Date("2026-06-05T11:00:00Z");
  const dt = new Date("2026-06-05T12:00:00Z");

  it("DateTimeOriginal 우선", () => {
    expect(
      selectCapturedAt({
        Photo: { DateTimeOriginal: dto, DateTimeDigitized: dtd },
        Image: { DateTime: dt },
      }),
    ).toBe(dto);
  });

  it("DateTimeOriginal 부재 → DateTimeDigitized 폴백", () => {
    expect(selectCapturedAt({ Photo: { DateTimeDigitized: dtd }, Image: { DateTime: dt } })).toBe(
      dtd,
    );
  });

  it("Photo 부재 → Image.DateTime 폴백", () => {
    expect(selectCapturedAt({ Image: { DateTime: dt } })).toBe(dt);
  });

  it("촬영시각 전부 부재 → null (신호 플래그)", () => {
    expect(selectCapturedAt({ Image: { Make: "Apple" } })).toBeNull();
  });

  it("유효하지 않은 Date → null", () => {
    expect(selectCapturedAt({ Photo: { DateTimeOriginal: new Date("nope") } })).toBeNull();
  });
});

describe("hasCameraExif (순수)", () => {
  it("Make 또는 Model 있으면 true", () => {
    expect(hasCameraExif({ Image: { Make: "Apple" } })).toBe(true);
    expect(hasCameraExif({ Image: { Model: "iPhone 15" } })).toBe(true);
  });

  it("Make/Model 부재·빈 문자열 → false (스크린샷 신호 입력)", () => {
    expect(hasCameraExif({ Image: {} })).toBe(false);
    expect(hasCameraExif({ Image: { Make: "  " } })).toBe(false);
    expect(hasCameraExif({})).toBe(false);
  });
});

describe("extractExifSignals (sharp → exif-reader)", () => {
  it("EXIF 있는 사진 → capturedAt·cameraExifPresent 추출", async () => {
    // sharp.withExif 는 IFD0.DateTime 을 기록한다(ExifIFD.DateTimeOriginal 은 미기록 → DateTime 폴백 경로 검증).
    const jpg = await sharp({
      create: { width: 48, height: 48, channels: 3, background: { r: 9, g: 9, b: 9 } },
    })
      .jpeg()
      .withExif({ IFD0: { Make: "Apple", Model: "iPhone 15", DateTime: "2026:06:05 10:30:00" } })
      .toBuffer();

    const s = await extractExifSignals(jpg);
    expect(s.exifPresent).toBe(true);
    expect(s.cameraExifPresent).toBe(true);
    expect(s.capturedAt).toBeInstanceOf(Date);
    expect(s.capturedAt?.toISOString()).toBe("2026-06-05T10:30:00.000Z");
    expect(s.width).toBe(48);
    expect(s.height).toBe(48);
  });

  it("EXIF 부재 사진 → capturedAt=null, 플래그 부재", async () => {
    const plain = await sharp({
      create: { width: 32, height: 64, channels: 3, background: { r: 1, g: 1, b: 1 } },
    })
      .jpeg()
      .toBuffer();

    const s = await extractExifSignals(plain);
    expect(s.exifPresent).toBe(false);
    expect(s.cameraExifPresent).toBe(false);
    expect(s.capturedAt).toBeNull();
    expect(s.width).toBe(32);
    expect(s.height).toBe(64);
  });

  it("동일 입력 → 동일 신호 (결정론)", async () => {
    const jpg = await sharp({
      create: { width: 40, height: 40, channels: 3, background: { r: 2, g: 4, b: 6 } },
    })
      .jpeg()
      .withExif({ IFD0: { Make: "Canon", DateTime: "2026:01:02 03:04:05" } })
      .toBuffer();
    const a = await extractExifSignals(jpg);
    const b = await extractExifSignals(jpg);
    expect(a).toEqual(b);
  });
});

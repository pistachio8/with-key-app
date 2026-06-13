// D-7 spec C4 — 업로드 정책 순수 함수 검증(1920px clamp · JPEG 파일명). expo 의존 없음.
import { resizeTarget, jpgName, MAX_EDGE } from "./upload-policy";

describe("resizeTarget (long-edge 1920px clamp)", () => {
  it("긴 축이 가로면 width 만 1920 으로 지정(비율은 manipulator 가 보존)", () => {
    expect(resizeTarget(4000, 3000)).toEqual({ width: MAX_EDGE });
  });

  it("긴 축이 세로면 height 만 1920 으로 지정", () => {
    expect(resizeTarget(3000, 4000)).toEqual({ height: MAX_EDGE });
  });

  it("이미 1920 이내면 리사이즈하지 않는다(빈 객체)", () => {
    expect(resizeTarget(1200, 800)).toEqual({});
    expect(resizeTarget(1920, 1080)).toEqual({});
  });

  it("치수 미상(0)은 리사이즈하지 않는다", () => {
    expect(resizeTarget(0, 0)).toEqual({});
  });

  it("정사각형은 width 로 clamp", () => {
    expect(resizeTarget(2400, 2400)).toEqual({ width: MAX_EDGE });
  });
});

describe("jpgName", () => {
  it("HEIC/PNG/WEBP/JPEG 확장자를 .jpg 로 정규화", () => {
    expect(jpgName("IMG_0001.HEIC")).toBe("IMG_0001.jpg");
    expect(jpgName("photo.png")).toBe("photo.jpg");
    expect(jpgName("shot.webp")).toBe("shot.jpg");
    expect(jpgName("a.jpeg")).toBe("a.jpg");
  });

  it("파일명이 없으면 기본 photo.jpg", () => {
    expect(jpgName(null)).toBe("photo.jpg");
    expect(jpgName(undefined)).toBe("photo.jpg");
    expect(jpgName("")).toBe("photo.jpg");
  });

  it("확장자 없는 이름은 .jpg 를 붙인다", () => {
    expect(jpgName("mealtime")).toBe("mealtime.jpg");
  });
});

import "server-only";
import sharp from "sharp";
import exifReader from "exif-reader";

// EXIF 촬영시각·카메라 신호 추출(AC-cheat-detect-1 ②).
// 선택 로직(selectCapturedAt·hasCameraExif)은 순수 함수로 분리해 합성 tags 로 결정론 테스트한다.
//
// 운영 주의: 클라 prepareForUpload 가 Canvas 재인코딩으로 EXIF 를 제거하므로, 현재 서버 도달
//   사진에는 EXIF 가 대부분 부재한다(capturedAt=null). 계산기는 EXIF 가 살아있는 입력(온디바이스
//   사전검증 EVAL-0023 / 원본 패스스루)에서 의미를 가지며, 본 모듈은 그 계산 골격을 고정한다.

// exif-reader(`export =`) 의 namespace 타입 의존을 피하려 필요한 필드만 구조적으로 좁힌다.
interface ExifTagsLike {
  Image?: { Make?: unknown; Model?: unknown; DateTime?: unknown };
  Photo?: { DateTimeOriginal?: unknown; DateTimeDigitized?: unknown };
}

export interface ExifSignals {
  /** EXIF 블록 존재 여부. */
  exifPresent: boolean;
  /** 카메라 마커(Make/Model) 존재 — 스크린샷 휴리스틱 입력. */
  cameraExifPresent: boolean;
  /** 촬영시각(DateTimeOriginal 우선). 부재 시 null = 신호 플래그. */
  capturedAt: Date | null;
  width: number | null;
  height: number | null;
}

function asDate(value: unknown): Date | null {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;
}

/** 순수: 촬영시각 선택 — DateTimeOriginal > DateTimeDigitized > Image.DateTime. */
export function selectCapturedAt(tags: ExifTagsLike): Date | null {
  return (
    asDate(tags.Photo?.DateTimeOriginal) ??
    asDate(tags.Photo?.DateTimeDigitized) ??
    asDate(tags.Image?.DateTime)
  );
}

/** 순수: 카메라 EXIF(Make/Model 비어있지 않음) 존재 여부. */
export function hasCameraExif(tags: ExifTagsLike): boolean {
  const nonEmpty = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;
  return nonEmpty(tags.Image?.Make) || nonEmpty(tags.Image?.Model);
}

/** sharp metadata → exif-reader 파싱 → 신호. 손상 EXIF 는 graceful(존재만 true). */
export async function extractExifSignals(image: Buffer | Uint8Array): Promise<ExifSignals> {
  const md = await sharp(image).metadata();
  const width = md.width ?? null;
  const height = md.height ?? null;

  if (!md.exif) {
    return { exifPresent: false, cameraExifPresent: false, capturedAt: null, width, height };
  }

  let tags: ExifTagsLike;
  try {
    tags = exifReader(md.exif) as ExifTagsLike;
  } catch {
    return { exifPresent: true, cameraExifPresent: false, capturedAt: null, width, height };
  }

  return {
    exifPresent: true,
    cameraExifPresent: hasCameraExif(tags),
    capturedAt: selectCapturedAt(tags),
    width,
    height,
  };
}

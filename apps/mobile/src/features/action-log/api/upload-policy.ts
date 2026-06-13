// 업로드 정책 — 순수 결정 함수 (D-7 spec C4 · web prepare-upload.ts 패리티).
// 네이티브 I/O(expo-image-manipulator)는 prepare-photo.ts 가 담당하고, 여기엔 expo 의존 없는
// 순수 로직만 둔다 — long-edge clamp 목표 치수 산출 + JPEG 파일명 정규화. 단위 테스트 대상.
import { MAX_PHOTO_BYTES } from "@withkey/domain";

// web prepare-upload.ts 와 동일 상수 — long-edge 1920px / JPEG quality 0.85.
export const MAX_EDGE = 1920;
export const JPEG_QUALITY = 0.85;
// 버킷 file_size_limit · server uploadPhoto MAX_PHOTO_BYTES(5MB)와 동일 상한.
export { MAX_PHOTO_BYTES };

/**
 * long-edge 를 maxEdge 로 clamp 한 목표 치수(비율 보존). 이미 이내면 빈 객체(리사이즈 불필요).
 * expo-image-manipulator resize 는 한 축만 주면 다른 축을 비율 보존으로 계산하므로 긴 축만 지정한다.
 */
export function resizeTarget(
  width: number,
  height: number,
  maxEdge = MAX_EDGE,
): { width?: number; height?: number } {
  const longEdge = Math.max(width, height);
  // 치수 미상(0)·이미 이내면 리사이즈하지 않는다.
  if (longEdge <= 0 || longEdge <= maxEdge) return {};
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}

/** 결과 파일명을 .jpg 로 정규화 — HEIC/PNG/WEBP 입력도 JPEG 로 저장하므로 확장자 일치. */
export function jpgName(fileName?: string | null): string {
  const base = (fileName ?? "").trim();
  if (!base) return "photo.jpg";
  return base.replace(/\.(heic|heif|png|webp|jpeg|jpg)$/i, "") + ".jpg";
}

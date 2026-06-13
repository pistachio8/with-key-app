// native 사진 압축 어댑터 (D-7 spec C4 · web prepare-upload.ts 패리티).
// 전송 전 long-edge 1920px clamp + JPEG quality 0.85 로 정규화한다. 결정 로직(목표 치수·파일명)은
// upload-policy.ts(순수, 단위 테스트)에 있고, 여기선 expo-image-manipulator I/O 만 한다 — 실기기 검증.
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import { JPEG_QUALITY, MAX_PHOTO_BYTES, jpgName, resizeTarget } from "./upload-policy";
import type { NativePhotoPart } from "./submit-action-log";

export type PreparePhotoInput = {
  uri: string;
  width: number;
  height: number;
  fileName?: string | null;
};

export type PreparePhotoResult =
  | { ok: true; photo: NativePhotoPart }
  | { ok: false; reason: "too_large" | "compress_failed" };

// 압축본 byte 크기 best-effort 측정 — file:// URI 를 blob 으로 읽는다.
// 측정 불가(null)면 통과시키고 서버 버킷 file_size_limit 이 최종 거부한다(web 과 동일 비파괴).
async function byteSize(uri: string): Promise<number | null> {
  try {
    const res = await fetch(uri);
    const blob = await res.blob();
    return blob.size;
  } catch {
    return null;
  }
}

/**
 * 전송 전 압축: long-edge 1920px clamp + JPEG 0.85. 결과 5MB 초과면 거부(버킷 상한 패리티).
 * 압축 실패는 비파괴 — 호출자가 "사진 미첨부" 또는 재시도 UX 로 폴백한다(web prepareForUpload 동등).
 */
export async function preparePhotoForUpload(input: PreparePhotoInput): Promise<PreparePhotoResult> {
  try {
    const context = ImageManipulator.manipulate(input.uri);
    const target = resizeTarget(input.width, input.height);
    if (target.width != null || target.height != null) context.resize(target);
    const image = await context.renderAsync();
    const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });

    const size = await byteSize(result.uri);
    if (size != null && size > MAX_PHOTO_BYTES) return { ok: false, reason: "too_large" };

    return {
      ok: true,
      photo: { uri: result.uri, name: jpgName(input.fileName), type: "image/jpeg" },
    };
  } catch (error) {
    // 사진 본문/EXIF 는 로그 금지 — 메타만.
    console.warn("[preparePhotoForUpload] compression failed", error);
    return { ok: false, reason: "compress_failed" };
  }
}

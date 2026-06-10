import "server-only";
import { computePhash } from "./phash";
import { extractExifSignals } from "./exif";
import { detectScreenshot, type ScreenshotSignal } from "./screenshot-heuristic";

// 결정론 신호 집계기. phash·EXIF·스크린샷을 한 번에 계산해 EVAL-0020 컬럼 기록 입력을 만든다.
// status 판정(passed/failed/...)은 하지 않는다 — θ 의존이라 EVAL-0022 분리.

// 신호 계산 로직 버전 marker(auto_verify_model_version). 알고리즘/비트수가 바뀌면 bump.
// θ(판정 임계)와 별개 — 이 값은 "어떤 신호 계산기가 이 행을 만들었나"를 이벤트 조인에 남긴다.
export const SIGNAL_MODEL_VERSION = "verify-signals-phash-dct64-v1";

export interface VerifySignals {
  phash: string;
  capturedAt: Date | null;
  exifPresent: boolean;
  cameraExifPresent: boolean;
  screenshot: ScreenshotSignal;
  /** 촬영→제출 간격(ms). submittedAt·capturedAt 둘 다 있을 때만, 아니면 null. */
  captureToSubmitMs: number | null;
  modelVersion: string;
}

/** 사진 버퍼에서 세 결정론 신호를 계산한다. 동일 입력 → 동일 신호. */
export async function computeVerifySignals(
  image: Buffer | Uint8Array,
  opts: { submittedAt?: Date } = {},
): Promise<VerifySignals> {
  const [phash, exif] = await Promise.all([computePhash(image), extractExifSignals(image)]);
  const screenshot = detectScreenshot({
    cameraExifPresent: exif.cameraExifPresent,
    exifPresent: exif.exifPresent,
    width: exif.width,
    height: exif.height,
  });
  const captureToSubmitMs =
    opts.submittedAt && exif.capturedAt
      ? opts.submittedAt.getTime() - exif.capturedAt.getTime()
      : null;

  return {
    phash,
    capturedAt: exif.capturedAt,
    exifPresent: exif.exifPresent,
    cameraExifPresent: exif.cameraExifPresent,
    screenshot,
    captureToSubmitMs,
    modelVersion: SIGNAL_MODEL_VERSION,
  };
}

/**
 * advisory 신호 점수(auto_verify_score) — soft 이상신호 개수. θ 무관 결정론.
 * 0 = 청정. 단독으로 status 를 내리지 않는다(EXIF 불신뢰·스크린샷 정상 가능성, θ spec).
 */
export function advisorySignalScore(signals: VerifySignals): number {
  let score = 0;
  if (!signals.exifPresent) score += 1;
  if (signals.screenshot.suspected) score += 1;
  return score;
}

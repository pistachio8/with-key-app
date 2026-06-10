// 결정론 사진 검증 신호(phash·EXIF·스크린샷). status 판정은 없다(θ 의존, EVAL-0022).
export {
  computePhash,
  dctPhash,
  hammingDistance,
  findPhashDuplicates,
  PHASH_BITS,
  PHASH_HEX_LEN,
  type PhashCandidate,
  type PhashMatch,
  type PhashDuplicateResult,
} from "./phash";
export { extractExifSignals, selectCapturedAt, hasCameraExif, type ExifSignals } from "./exif";
export {
  detectScreenshot,
  type ScreenshotInput,
  type ScreenshotSignal,
} from "./screenshot-heuristic";
export {
  computeVerifySignals,
  advisorySignalScore,
  SIGNAL_MODEL_VERSION,
  type VerifySignals,
} from "./signals";
export { recordVerifySignals } from "./record";

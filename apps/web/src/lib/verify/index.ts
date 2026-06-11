// 결정론 사진 검증 신호(phash·EXIF·스크린샷) + θ 임계 status 판정(EVAL-0022).
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
export { loadVerifyConfig, type VerifyConfig } from "./config";
export {
  judgeVerifyStatus,
  countsTowardDone,
  classifyPhashMatches,
  judgeAndRecordVerifyStatus,
  JUDGE_MODEL_VERSION,
  type AutoVerifyStatus,
  type AutoVerifyDbStatus,
  type ScopedPhashMatches,
  type JudgeDecision,
} from "./judge";
export {
  precheckPhotoFile,
  judgePhotoPrecheck,
  computeLaplacianVariance,
  PHOTO_PRECHECK_MODEL_VERSION,
  BLUR_LAPLACIAN_VARIANCE_THRESHOLD,
  type PhotoPrecheckReason,
  type PhotoPrecheckResult,
  type PhotoPrecheckInput,
  type BlurSignal,
} from "./precheck";

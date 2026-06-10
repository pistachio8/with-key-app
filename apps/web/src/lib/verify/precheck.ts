import { detectScreenshot, type ScreenshotSignal } from "./screenshot-heuristic";

export const PHOTO_PRECHECK_MODEL_VERSION = "verify-precheck-v1";
export const BLUR_LAPLACIAN_VARIANCE_THRESHOLD = 80;
const SAMPLE_MAX_EDGE = 96;

export type PhotoPrecheckReason = "blurry" | "screenshot";

export interface BlurSignal {
  variance: number | null;
  threshold: number;
  suspected: boolean;
}

export interface PhotoPrecheckResult {
  modelVersion: typeof PHOTO_PRECHECK_MODEL_VERSION;
  shouldRetake: boolean;
  reasons: PhotoPrecheckReason[];
  blur: BlurSignal;
  screenshot: ScreenshotSignal;
}

export interface PhotoPrecheckInput {
  width: number | null;
  height: number | null;
  blurVariance: number | null;
  cameraExifPresent: boolean;
  exifPresent: boolean;
}

function cleanResult(): PhotoPrecheckResult {
  return {
    modelVersion: PHOTO_PRECHECK_MODEL_VERSION,
    shouldRetake: false,
    reasons: [],
    blur: {
      variance: null,
      threshold: BLUR_LAPLACIAN_VARIANCE_THRESHOLD,
      suspected: false,
    },
    screenshot: { suspected: false, reasons: [] },
  };
}

function luma(data: Uint8ClampedArray, pixelOffset: number): number {
  return data[pixelOffset] * 0.299 + data[pixelOffset + 1] * 0.587 + data[pixelOffset + 2] * 0.114;
}

/**
 * Variance of a 3x3 Laplacian response. Low variance means very little edge
 * detail, which is the fast blur signal we need before upload.
 */
export function computeLaplacianVariance(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): number | null {
  if (width < 3 || height < 3 || data.length < width * height * 4) return null;

  let sum = 0;
  let sumSquares = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const center = (y * width + x) * 4;
      const top = ((y - 1) * width + x) * 4;
      const bottom = ((y + 1) * width + x) * 4;
      const left = (y * width + x - 1) * 4;
      const right = (y * width + x + 1) * 4;
      const topLeft = ((y - 1) * width + x - 1) * 4;
      const topRight = ((y - 1) * width + x + 1) * 4;
      const bottomLeft = ((y + 1) * width + x - 1) * 4;
      const bottomRight = ((y + 1) * width + x + 1) * 4;

      const response =
        8 * luma(data, center) -
        luma(data, top) -
        luma(data, bottom) -
        luma(data, left) -
        luma(data, right) -
        luma(data, topLeft) -
        luma(data, topRight) -
        luma(data, bottomLeft) -
        luma(data, bottomRight);

      sum += response;
      sumSquares += response * response;
      count += 1;
    }
  }

  if (count === 0) return null;
  const mean = sum / count;
  return sumSquares / count - mean * mean;
}

export function judgePhotoPrecheck(input: PhotoPrecheckInput): PhotoPrecheckResult {
  const screenshot = detectScreenshot({
    cameraExifPresent: input.cameraExifPresent,
    exifPresent: input.exifPresent,
    width: input.width,
    height: input.height,
  });
  const blur: BlurSignal = {
    variance: input.blurVariance,
    threshold: BLUR_LAPLACIAN_VARIANCE_THRESHOLD,
    suspected:
      input.blurVariance !== null && input.blurVariance < BLUR_LAPLACIAN_VARIANCE_THRESHOLD,
  };
  const reasons: PhotoPrecheckReason[] = [];
  if (blur.suspected) reasons.push("blurry");
  if (screenshot.suspected) reasons.push("screenshot");

  return {
    modelVersion: PHOTO_PRECHECK_MODEL_VERSION,
    shouldRetake: reasons.length > 0,
    reasons,
    blur,
    screenshot,
  };
}

function sampleDimensions(width: number, height: number): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  const scale = longEdge > SAMPLE_MAX_EDGE ? SAMPLE_MAX_EDGE / longEdge : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function readSample(bitmap: ImageBitmap): ImageData {
  const size = sampleDimensions(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2d context unavailable");
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  return ctx.getImageData(0, 0, size.width, size.height);
}

export async function precheckPhotoFile(file: Blob): Promise<PhotoPrecheckResult> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return cleanResult();
  }

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      const sample = readSample(bitmap);
      const blurVariance = computeLaplacianVariance(sample.data, sample.width, sample.height);
      return judgePhotoPrecheck({
        width: bitmap.width,
        height: bitmap.height,
        blurVariance,
        // PWA precheck intentionally stays advisory. Without a browser EXIF parser
        // we reuse EVAL-0021's no-camera-EXIF branch and require screen dimensions.
        cameraExifPresent: false,
        exifPresent: false,
      });
    } finally {
      bitmap.close();
    }
  } catch {
    return cleanResult();
  }
}

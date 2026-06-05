import { resizeToJpeg } from "./resize-to-jpeg";

const MAX_EDGE = 1920;
const QUALITY = 0.85;
const HEIC_EXT_RE = /\.(heic|heif)$/i;
const HEIC_MIME_RE = /^image\/hei[cf]$/i;

function isHeic(file: File): boolean {
  if (file.type && HEIC_MIME_RE.test(file.type)) return true;
  return HEIC_EXT_RE.test(file.name);
}

function renameToJpg(name: string): string {
  return name.replace(/\.(heic|heif|png|webp)$/i, ".jpg");
}

/**
 * Mobile upload entry point. HEIC/HEIF goes through heic2any (JPEG), and
 * every input is then normalized to a long-edge 1920px JPEG (quality 0.85).
 * On any failure, returns the original file — the Storage bucket policy
 * gives the final "reject HEIC" answer so a failed transcode falls back to
 * the non-destructive "no photo attached" UX.
 */
export async function prepareForUpload(file: File): Promise<File> {
  try {
    let source: Blob = file;
    if (isHeic(file)) {
      const { default: heic2any } = await import("heic2any");
      const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: QUALITY });
      source = Array.isArray(converted) ? converted[0] : converted;
    }

    const jpeg = await resizeToJpeg(source, { maxEdge: MAX_EDGE, quality: QUALITY });
    return new File([jpeg], renameToJpg(file.name), { type: "image/jpeg" });
  } catch (error) {
    console.warn("[prepareForUpload] fell back to original file", error);
    return file;
  }
}

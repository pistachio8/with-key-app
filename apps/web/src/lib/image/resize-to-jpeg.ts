export interface ResizeOptions {
  maxEdge: number;
  quality: number;
}

/**
 * long edge → maxEdge clamp → Canvas draw → JPEG Blob.
 * OffscreenCanvas fallback to HTMLCanvasElement when unsupported.
 */
export async function resizeToJpeg(
  source: Blob,
  { maxEdge, quality }: ResizeOptions,
): Promise<Blob> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longEdge > maxEdge ? maxEdge / longEdge : 1;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2d context unavailable");
      ctx.drawImage(bitmap, 0, 0, width, height);
      return await canvas.convertToBlob({ type: "image/jpeg", quality });
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob>((resolveBlob, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolveBlob(blob) : reject(new Error("toBlob returned null"))),
        "image/jpeg",
        quality,
      );
    });
  } finally {
    bitmap.close?.();
  }
}

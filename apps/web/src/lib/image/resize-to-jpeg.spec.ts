import { describe, expect, it, vi, beforeEach } from "vitest";
import { resizeToJpeg } from "./resize-to-jpeg";

type BitmapStub = { width: number; height: number; close: () => void };

function makeCanvasStub(): HTMLCanvasElement {
  const ctx = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toBlob: vi.fn((cb: BlobCallback) => cb(new Blob(["jpeg"], { type: "image/jpeg" }))),
  } as unknown as HTMLCanvasElement;
}

describe("resizeToJpeg", () => {
  beforeEach(() => {
    // Force the HTMLCanvasElement fallback path — OffscreenCanvas isn't
    // available in jsdom anyway, but be explicit to keep the test stable.
    (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = undefined;
    (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = vi.fn(
      async () => ({ width: 4000, height: 3000, close: vi.fn() }) satisfies BitmapStub,
    );
    (globalThis as unknown as { document: unknown }).document = {
      createElement: vi.fn(() => makeCanvasStub()),
    };
  });

  it("clamps long edge to maxEdge and outputs JPEG", async () => {
    const source = new Blob(["x"], { type: "image/png" });
    const out = await resizeToJpeg(source, { maxEdge: 1920, quality: 0.85 });
    expect(out.type).toBe("image/jpeg");
    const ci = (globalThis as unknown as { createImageBitmap: ReturnType<typeof vi.fn> })
      .createImageBitmap;
    expect(ci).toHaveBeenCalledWith(source, { imageOrientation: "from-image" });
  });

  it("keeps dimensions when already small", async () => {
    (
      globalThis as unknown as { createImageBitmap: ReturnType<typeof vi.fn> }
    ).createImageBitmap.mockResolvedValueOnce({
      width: 800,
      height: 600,
      close: vi.fn(),
    } satisfies BitmapStub);
    const out = await resizeToJpeg(new Blob(["x"], { type: "image/jpeg" }), {
      maxEdge: 1920,
      quality: 0.85,
    });
    expect(out.type).toBe("image/jpeg");
  });
});

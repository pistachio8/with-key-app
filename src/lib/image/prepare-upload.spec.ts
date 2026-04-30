import { describe, expect, it, vi, beforeEach } from "vitest";

const heic2anyMock = vi.fn();
vi.mock("heic2any", () => ({ default: (...args: unknown[]) => heic2anyMock(...args) }));

const resizeMock = vi.fn();
vi.mock("./resize-to-jpeg", () => ({
  resizeToJpeg: (...args: unknown[]) => resizeMock(...args),
}));

import { prepareForUpload } from "./prepare-upload";

describe("prepareForUpload", () => {
  beforeEach(() => {
    heic2anyMock.mockReset();
    resizeMock.mockReset();
    resizeMock.mockResolvedValue(new Blob(["jpeg"], { type: "image/jpeg" }));
  });

  it("routes HEIC through heic2any then resize", async () => {
    heic2anyMock.mockResolvedValue(new Blob(["after-heic"], { type: "image/jpeg" }));
    const file = new File(["heic-bytes"], "IMG_0001.HEIC", { type: "image/heic" });

    const out = await prepareForUpload(file);

    expect(heic2anyMock).toHaveBeenCalledWith({
      blob: file,
      toType: "image/jpeg",
      quality: 0.85,
    });
    expect(resizeMock).toHaveBeenCalledTimes(1);
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("IMG_0001.jpg");
  });

  it("skips heic2any for non-HEIC but still resizes", async () => {
    const file = new File(["jpg-bytes"], "photo.jpg", { type: "image/jpeg" });

    await prepareForUpload(file);

    expect(heic2anyMock).not.toHaveBeenCalled();
    expect(resizeMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to original file when conversion throws", async () => {
    resizeMock.mockRejectedValueOnce(new Error("canvas failed"));
    const file = new File(["jpg-bytes"], "photo.jpg", { type: "image/jpeg" });

    const out = await prepareForUpload(file);

    expect(out).toBe(file);
  });

  it("detects HEIC by extension when MIME is empty (iOS Safari)", async () => {
    heic2anyMock.mockResolvedValue(new Blob(["after"], { type: "image/jpeg" }));
    const file = new File(["bytes"], "IMG.heic", { type: "" });

    await prepareForUpload(file);

    expect(heic2anyMock).toHaveBeenCalled();
  });
});

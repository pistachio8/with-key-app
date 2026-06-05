import { describe, expect, it } from "vitest";
import { buildPhotoPath, extFromFile, looksLikePhotoPath } from "./action-photos";

describe("buildPhotoPath", () => {
  it("composes the Storage path", () => {
    const path = buildPhotoPath({
      userId: "user-1",
      challengeId: "challenge-1",
      actionLogId: "log-1",
      ext: "jpg",
      nonce: "abcd",
    });
    expect(path).toBe("user-1/challenge-1/log-1-abcd.jpg");
  });

  it("rejects traversal segments", () => {
    expect(() =>
      buildPhotoPath({
        userId: "../etc",
        challengeId: "challenge-1",
        actionLogId: "log-1",
        ext: "jpg",
        nonce: "abcd",
      }),
    ).toThrow(/invalid/i);
  });

  it("rejects unsupported extensions (including heic)", () => {
    for (const ext of ["exe", "heic", "heif"]) {
      expect(() =>
        buildPhotoPath({
          userId: "user-1",
          challengeId: "challenge-1",
          actionLogId: "log-1",
          ext,
          nonce: "abcd",
        }),
      ).toThrow(/extension/);
    }
  });
});

describe("extFromFile", () => {
  it("uses the allowed mime type when present", () => {
    expect(extFromFile({ type: "image/jpeg", name: "photo" } as File)).toBe("jpg");
    expect(extFromFile({ type: "image/png", name: "photo" } as File)).toBe("png");
  });

  it("falls back to the extension only when mime is empty", () => {
    expect(extFromFile({ type: "", name: "photo.WEBP" } as File)).toBe("webp");
  });

  it("rejects HEIC and HEIF after client transcode policy", () => {
    expect(() => extFromFile({ type: "image/heic", name: "a.heic" } as File)).toThrow(/mime/);
    expect(() => extFromFile({ type: "", name: "a.HEIC" } as File)).toThrow(/unknown/);
  });

  it("rejects unsupported non-empty mime types", () => {
    expect(() => extFromFile({ type: "application/pdf", name: "photo.jpg" } as File)).toThrow(
      /mime/,
    );
  });
});

describe("looksLikePhotoPath", () => {
  it("accepts private Storage paths for allowed ext", () => {
    expect(looksLikePhotoPath("u/c/l-nonce.webp")).toBe(true);
    expect(looksLikePhotoPath("u/c/l-nonce.jpg")).toBe(true);
  });

  it("rejects heic/heif paths", () => {
    expect(looksLikePhotoPath("u/c/l-nonce.heic")).toBe(false);
    expect(looksLikePhotoPath("u/c/l-nonce.heif")).toBe(false);
  });

  it("rejects legacy URLs", () => {
    expect(looksLikePhotoPath("https://example.com/photo.jpg")).toBe(false);
  });
});

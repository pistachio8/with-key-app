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

  it("rejects unsupported extensions", () => {
    expect(() =>
      buildPhotoPath({
        userId: "user-1",
        challengeId: "challenge-1",
        actionLogId: "log-1",
        ext: "exe",
        nonce: "abcd",
      }),
    ).toThrow(/extension/);
  });
});

describe("extFromFile", () => {
  it("uses the allowed mime type when present", () => {
    expect(extFromFile({ type: "image/jpeg", name: "photo" } as File)).toBe("jpg");
    expect(extFromFile({ type: "image/heic", name: "photo" } as File)).toBe("heic");
  });

  it("falls back to the extension only when mime is empty", () => {
    expect(extFromFile({ type: "", name: "photo.HEIF" } as File)).toBe("heif");
  });

  it("rejects unsupported non-empty mime types", () => {
    expect(() => extFromFile({ type: "application/pdf", name: "photo.jpg" } as File)).toThrow(
      /mime/,
    );
  });
});

describe("looksLikePhotoPath", () => {
  it("accepts private Storage paths", () => {
    expect(looksLikePhotoPath("u/c/l-nonce.webp")).toBe(true);
  });

  it("rejects legacy URLs", () => {
    expect(looksLikePhotoPath("https://example.com/photo.jpg")).toBe(false);
  });
});

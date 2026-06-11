import { describe, expect, it } from "vitest";
import {
  buildFeedbackPhotoPath,
  looksLikeFeedbackPhotoPath,
  FEEDBACK_SIGNED_URL_TTL_SECONDS,
} from "./feedback-photos";

describe("buildFeedbackPhotoPath", () => {
  it("composes the 2-segment Storage path", () => {
    const path = buildFeedbackPhotoPath({
      userId: "user-1",
      feedbackId: "fb-1",
      ext: "jpg",
      nonce: "abcd",
    });
    expect(path).toBe("user-1/fb-1-abcd.jpg");
  });

  it("rejects traversal segments", () => {
    expect(() =>
      buildFeedbackPhotoPath({ userId: "../etc", feedbackId: "fb-1", ext: "jpg", nonce: "a" }),
    ).toThrow(/invalid/i);
  });

  it("rejects unsupported extensions (including heic)", () => {
    for (const ext of ["exe", "heic", "heif"]) {
      expect(() =>
        buildFeedbackPhotoPath({ userId: "u", feedbackId: "f", ext, nonce: "a" }),
      ).toThrow(/extension/);
    }
  });
});

describe("looksLikeFeedbackPhotoPath", () => {
  it("accepts the canonical 2-segment path", () => {
    expect(looksLikeFeedbackPhotoPath("user-1/fb-1-abcd.jpg")).toBe(true);
  });

  it("rejects URLs, 3-segment paths, and null", () => {
    expect(looksLikeFeedbackPhotoPath("https://x.com/a/b.jpg")).toBe(false);
    expect(looksLikeFeedbackPhotoPath("u/c/log-1-a.jpg")).toBe(false);
    expect(looksLikeFeedbackPhotoPath(null)).toBe(false);
  });
});

describe("FEEDBACK_SIGNED_URL_TTL_SECONDS", () => {
  it("is 72 hours (spec C5)", () => {
    expect(FEEDBACK_SIGNED_URL_TTL_SECONDS).toBe(72 * 60 * 60);
  });
});

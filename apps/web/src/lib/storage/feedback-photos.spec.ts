import { describe, expect, it } from "vitest";
import {
  buildFeedbackPhotoPath,
  looksLikeFeedbackPhotoPath,
  uploadFeedbackPhotos,
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

describe("uploadFeedbackPhotos", () => {
  it("같은 feedbackId 로 N장 업로드하고 성공 path 만 반환", async () => {
    const client = {
      storage: { from: () => ({ upload: async () => ({ error: null }) }) },
    } as unknown as import("@supabase/supabase-js").SupabaseClient;
    const mk = (n: string) => new File([new Uint8Array([1, 2, 3])], n, { type: "image/png" });

    const paths = await uploadFeedbackPhotos({
      userId: "11111111-1111-1111-1111-111111111111",
      feedbackId: "22222222-2222-2222-2222-222222222222",
      files: [mk("a.png"), mk("b.png")],
      client,
    });

    expect(paths).toHaveLength(2);
    expect(
      paths.every((p) =>
        p.startsWith("11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222-"),
      ),
    ).toBe(true);
  });
});

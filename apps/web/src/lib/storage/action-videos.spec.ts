import { describe, expect, it } from "vitest";
import { buildVideoPath, extFromVideoFile, looksLikeVideoPath } from "./action-videos";

describe("buildVideoPath", () => {
  it("composes the Storage path", () => {
    const path = buildVideoPath({
      userId: "user-1",
      challengeId: "challenge-1",
      actionLogId: "log-1",
      ext: "mp4",
      nonce: "abcd",
    });
    expect(path).toBe("user-1/challenge-1/log-1-abcd.mp4");
  });

  it("rejects traversal segments", () => {
    expect(() =>
      buildVideoPath({
        userId: "../etc",
        challengeId: "challenge-1",
        actionLogId: "log-1",
        ext: "mp4",
        nonce: "abcd",
      }),
    ).toThrow(/invalid/i);
  });

  it("rejects unsupported extensions (photo)", () => {
    for (const ext of ["jpg", "gif"]) {
      expect(() =>
        buildVideoPath({
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

describe("looksLikeVideoPath", () => {
  it("accepts a well-formed mp4/webm path", () => {
    expect(looksLikeVideoPath("u/c/log-nonce.mp4")).toBe(true);
    expect(looksLikeVideoPath("u/c/log-nonce.webm")).toBe(true);
  });

  it("rejects URLs, photo extensions, and empty values", () => {
    expect(looksLikeVideoPath("https://example.com/x.mp4")).toBe(false);
    expect(looksLikeVideoPath("u/c/log-nonce.jpg")).toBe(false);
    expect(looksLikeVideoPath(null)).toBe(false);
    expect(looksLikeVideoPath(undefined)).toBe(false);
  });
});

describe("extFromVideoFile", () => {
  it("maps allowed video MIME to extension", () => {
    expect(extFromVideoFile({ type: "video/mp4", name: "clip" })).toBe("mp4");
    expect(extFromVideoFile({ type: "video/webm", name: "clip" })).toBe("webm");
  });

  it("falls back to the filename extension when type is empty", () => {
    expect(extFromVideoFile({ type: "", name: "clip.webm" })).toBe("webm");
  });

  it("rejects a non-allowlisted MIME", () => {
    expect(() => extFromVideoFile({ type: "image/jpeg", name: "clip.jpg" })).toThrow(/mime/);
  });
});

describe("action-videos — mov(quicktime) 허용 (0059)", () => {
  it("extFromVideoFile: video/quicktime → mov", () => {
    expect(extFromVideoFile({ type: "video/quicktime", name: "x.mov" })).toBe("mov");
  });
  it("buildVideoPath: mov 확장자 throw 없음", () => {
    const path = buildVideoPath({
      userId: "u1",
      challengeId: "c1",
      actionLogId: "penalty",
      ext: "mov",
      nonce: "abc123",
    });
    expect(path).toBe("u1/c1/penalty-abc123.mov");
  });
  it("looksLikeVideoPath: .mov 경로 수용 (feed getVideoSignedUrls gate)", () => {
    expect(looksLikeVideoPath("u1/c1/penalty-abc.mov")).toBe(true);
  });
});

// src/lib/invite/share-url.spec.ts
import { describe, it, expect } from "vitest";
import { buildInviteUrl } from "./share-url";

describe("buildInviteUrl", () => {
  it("joins origin and token", () => {
    expect(buildInviteUrl("https://example.com", "abc123")).toBe(
      "https://example.com/invite/abc123",
    );
  });

  it("strips trailing slash on origin", () => {
    expect(buildInviteUrl("https://example.com/", "abc123")).toBe(
      "https://example.com/invite/abc123",
    );
  });

  it("encodes token characters that are unsafe in a URL path", () => {
    const weird = "a/b?c#d";
    expect(buildInviteUrl("https://example.com", weird)).toBe(
      `https://example.com/invite/${encodeURIComponent(weird)}`,
    );
  });
});

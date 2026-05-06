// src/lib/invite/token.spec.ts
import { describe, it, expect } from "vitest";
import { generateInviteToken } from "./token";

describe("generateInviteToken", () => {
  it("returns a base64url string of fixed length (32B ⇒ 43 chars)", () => {
    const t = generateInviteToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes → base64url without padding = 43 chars.
    expect(t.length).toBe(43);
  });

  it("produces unique values across 1k calls", () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(generateInviteToken());
    expect(set.size).toBe(1000);
  });
});

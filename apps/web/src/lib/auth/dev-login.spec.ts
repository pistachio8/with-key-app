import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: vi.fn(),
}));

import { mintDevToken, isDevLoginEnabled } from "./dev-login";
import { adminClient } from "@/lib/supabase/admin";

function mockGenerateLink(result: unknown) {
  vi.mocked(adminClient).mockReturnValue({
    auth: { admin: { generateLink: vi.fn().mockResolvedValue(result) } },
  } as never);
}

describe("dev-login server core", () => {
  beforeEach(() => {
    vi.mocked(adminClient).mockReset();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("isDevLoginEnabled", () => {
    it("is true only when DEV_LOGIN_ENABLED === 'true'", () => {
      vi.stubEnv("DEV_LOGIN_ENABLED", "true");
      expect(isDevLoginEnabled()).toBe(true);

      vi.stubEnv("DEV_LOGIN_ENABLED", "1");
      expect(isDevLoginEnabled()).toBe(false);

      vi.stubEnv("DEV_LOGIN_ENABLED", "");
      expect(isDevLoginEnabled()).toBe(false);
    });
  });

  describe("mintDevToken", () => {
    it("throws 404 when disabled, before calling admin", async () => {
      vi.stubEnv("DEV_LOGIN_ENABLED", "");
      vi.stubEnv("DEV_LOGIN_EMAILS", "a@b.test");

      await expect(mintDevToken("a@b.test")).rejects.toMatchObject({ status: 404 });
      expect(adminClient).not.toHaveBeenCalled();
    });

    it("throws 400 when email is not in the allowlist, before calling admin", async () => {
      vi.stubEnv("DEV_LOGIN_ENABLED", "true");
      vi.stubEnv("DEV_LOGIN_EMAILS", "a@b.test");

      await expect(mintDevToken("x@b.test")).rejects.toMatchObject({ status: 400 });
      expect(adminClient).not.toHaveBeenCalled();
    });

    it("returns hashed_token for an allowlisted email (trims and splits DEV_LOGIN_EMAILS)", async () => {
      vi.stubEnv("DEV_LOGIN_ENABLED", "true");
      vi.stubEnv("DEV_LOGIN_EMAILS", " a@b.test , c@d.test ");
      mockGenerateLink({ data: { properties: { hashed_token: "HASH-123" } }, error: null });

      await expect(mintDevToken("c@d.test")).resolves.toBe("HASH-123");
    });

    it("throws 502 when generateLink returns an error", async () => {
      vi.stubEnv("DEV_LOGIN_ENABLED", "true");
      vi.stubEnv("DEV_LOGIN_EMAILS", "a@b.test");
      mockGenerateLink({ data: null, error: { message: "boom" } });

      await expect(mintDevToken("a@b.test")).rejects.toMatchObject({ status: 502 });
    });

    it("throws 502 when no hashed_token is returned", async () => {
      vi.stubEnv("DEV_LOGIN_ENABLED", "true");
      vi.stubEnv("DEV_LOGIN_EMAILS", "a@b.test");
      mockGenerateLink({ data: { properties: {} }, error: null });

      await expect(mintDevToken("a@b.test")).rejects.toMatchObject({ status: 502 });
    });
  });
});

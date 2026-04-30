// Server Action unit spec — verifies emailRedirectTo is built from the
// live request origin (so Vercel preview URLs work) with env/localhost as
// a last-resort fallback.
import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOtp = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithOtp: (...args: unknown[]) => signInWithOtp(...args) } }),
}));

const headersGet = vi.fn<(name: string) => string | null>();
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => headersGet(name) }),
}));

import { requestMagicLink } from "./_actions";

describe("requestMagicLink", () => {
  beforeEach(() => {
    signInWithOtp.mockReset();
    signInWithOtp.mockResolvedValue({ error: null });
    headersGet.mockReset();
    headersGet.mockImplementation(() => null);
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("returns invalid_input for malformed emails without calling Supabase", async () => {
    const res = await requestMagicLink("not-an-email");
    expect(res.ok).toBe(false);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("uses the request Origin header for emailRedirectTo", async () => {
    headersGet.mockImplementation((name) =>
      name === "origin" ? "https://with-key-app-git-foo.vercel.app" : null,
    );

    const res = await requestMagicLink("user@example.com");

    expect(res.ok).toBe(true);
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      options: {
        emailRedirectTo: "https://with-key-app-git-foo.vercel.app/auth/callback",
      },
    });
  });

  it("falls back to x-forwarded-host + proto when origin is missing", async () => {
    headersGet.mockImplementation((name) => {
      if (name === "x-forwarded-host") return "preview.example.com";
      if (name === "x-forwarded-proto") return "https";
      return null;
    });

    await requestMagicLink("user@example.com");

    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { emailRedirectTo: "https://preview.example.com/auth/callback" },
      }),
    );
  });

  it("uses NEXT_PUBLIC_APP_URL only when no request headers are available", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    await requestMagicLink("user@example.com");

    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { emailRedirectTo: "http://localhost:3000/auth/callback" },
      }),
    );
  });

  it("returns upstream_error when Supabase signInWithOtp fails", async () => {
    headersGet.mockImplementation((name) =>
      name === "origin" ? "https://example.com" : null,
    );
    signInWithOtp.mockResolvedValueOnce({ error: { message: "boom" } });

    const res = await requestMagicLink("user@example.com");

    expect(res.ok).toBe(false);
  });
});

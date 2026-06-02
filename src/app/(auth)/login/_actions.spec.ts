// Server Action unit spec — verifies emailRedirectTo is built from the
// live request origin (so Vercel preview URLs work) with env/localhost as
// a last-resort fallback.
import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOtp = vi.fn();
const getUser = vi.fn();
// markOnboarded() 의 update 체인을 단계별로 모킹하기 위한 핸들 — 각 테스트에서 동적으로 응답을 바꾼다.
const usersUpdateSingle = vi.fn();
const updateSpy = vi.fn();
const eqSpy = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithOtp: (...args: unknown[]) => signInWithOtp(...args),
      getUser: () => getUser(),
    },
    from: (table: string) => {
      if (table !== "users") throw new Error(`unexpected table: ${table}`);
      return {
        update: (patch: Record<string, unknown>) => {
          updateSpy(patch);
          return {
            eq: (col: string, val: string) => {
              eqSpy(col, val);
              return {
                select: () => ({
                  single: () => usersUpdateSingle(),
                }),
              };
            },
          };
        },
      };
    },
  }),
}));

const headersGet = vi.fn<(name: string) => string | null>();
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => headersGet(name) }),
}));

import { markOnboarded, requestMagicLink } from "./_actions";

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

  it("appends a valid internal next path to emailRedirectTo so the callback ?next= branch fires", async () => {
    headersGet.mockImplementation((name) => (name === "origin" ? "https://example.com" : null));

    await requestMagicLink("user@example.com", "/invite/abc-token-123");

    const call = signInWithOtp.mock.calls[0][0] as {
      options: { emailRedirectTo: string };
    };
    const redirect = new URL(call.options.emailRedirectTo);
    expect(redirect.origin).toBe("https://example.com");
    expect(redirect.pathname).toBe("/auth/callback");
    expect(redirect.searchParams.get("next")).toBe("/invite/abc-token-123");
  });

  it("drops next when it is an absolute URL (open-redirect guard)", async () => {
    headersGet.mockImplementation((name) => (name === "origin" ? "https://example.com" : null));

    await requestMagicLink("user@example.com", "https://evil.example/steal");

    const call = signInWithOtp.mock.calls[0][0] as {
      options: { emailRedirectTo: string };
    };
    expect(call.options.emailRedirectTo).toBe("https://example.com/auth/callback");
  });

  it("drops next when it is protocol-relative (//host)", async () => {
    headersGet.mockImplementation((name) => (name === "origin" ? "https://example.com" : null));

    await requestMagicLink("user@example.com", "//evil.example/steal");

    const call = signInWithOtp.mock.calls[0][0] as {
      options: { emailRedirectTo: string };
    };
    expect(call.options.emailRedirectTo).toBe("https://example.com/auth/callback");
  });

  it("returns upstream_error when Supabase signInWithOtp fails", async () => {
    headersGet.mockImplementation((name) => (name === "origin" ? "https://example.com" : null));
    signInWithOtp.mockResolvedValueOnce({ error: { message: "boom" } });

    const res = await requestMagicLink("user@example.com");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("upstream_error");
  });

  it("maps Supabase 429 (status) to rate_limited", async () => {
    headersGet.mockImplementation((name) => (name === "origin" ? "https://example.com" : null));
    signInWithOtp.mockResolvedValueOnce({
      error: { status: 429, message: "Email rate limit exceeded" },
    });

    const res = await requestMagicLink("user@example.com");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("rate_limited");
  });

  it("maps Supabase over_email_send_rate_limit code to rate_limited", async () => {
    headersGet.mockImplementation((name) => (name === "origin" ? "https://example.com" : null));
    signInWithOtp.mockResolvedValueOnce({
      error: { code: "over_email_send_rate_limit", message: "cool down" },
    });

    const res = await requestMagicLink("user@example.com");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("rate_limited");
  });
});

describe("markOnboarded", () => {
  const USER_ID = "11111111-2222-3333-4444-555555555555";

  beforeEach(() => {
    getUser.mockReset();
    usersUpdateSingle.mockReset();
    updateSpy.mockReset();
    eqSpy.mockReset();
  });

  it("returns unauthorized when no session is present", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });

    const res = await markOnboarded();

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("unauthorized");
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("updates public.users.onboarded_at scoped to auth user and returns the saved timestamp", async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: USER_ID } } });
    usersUpdateSingle.mockResolvedValueOnce({
      data: { onboarded_at: "2026-05-16T12:34:56.789Z" },
      error: null,
    });

    const res = await markOnboarded();

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.onboardedAt).toBe("2026-05-16T12:34:56.789Z");
    // update payload 는 단일 컬럼 onboarded_at — ISO 8601 형식이어야 한다.
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const patch = updateSpy.mock.calls[0][0] as { onboarded_at: string };
    expect(Object.keys(patch)).toEqual(["onboarded_at"]);
    expect(patch.onboarded_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    // RLS users_update_self 가 강제하는 self-scope — id = auth.uid().
    expect(eqSpy).toHaveBeenCalledWith("id", USER_ID);
  });

  it("returns upstream_error when the update fails (callers fall back to /home silently)", async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: USER_ID } } });
    usersUpdateSingle.mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    const res = await markOnboarded();

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("upstream_error");
  });
});

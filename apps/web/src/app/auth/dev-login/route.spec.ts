import { describe, it, expect, vi, beforeEach } from "vitest";

// Self-contained mock so the route's `error instanceof DevLoginError` works:
// the test throws the SAME mocked class the route imports.
vi.mock("@/lib/auth/dev-login", () => {
  class DevLoginError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    isDevLoginEnabled: vi.fn(),
    mintDevToken: vi.fn(),
    DevLoginError,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { GET } from "./route";
import { isDevLoginEnabled, mintDevToken, DevLoginError } from "@/lib/auth/dev-login";
import { createClient } from "@/lib/supabase/server";

function req(query: string) {
  return new Request(`https://app.example/auth/dev-login${query}`) as never;
}

function mockVerifyOtp(error: unknown) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { verifyOtp: vi.fn().mockResolvedValue({ error }) },
  } as never);
}

describe("GET /auth/dev-login", () => {
  beforeEach(() => {
    vi.mocked(isDevLoginEnabled).mockReset();
    vi.mocked(mintDevToken).mockReset();
    vi.mocked(createClient).mockReset();
  });

  it("returns 404 when dev login is disabled", async () => {
    vi.mocked(isDevLoginEnabled).mockReturnValue(false);

    const res = await GET(req("?email=a@b.test"));

    expect(res.status).toBe(404);
    expect(mintDevToken).not.toHaveBeenCalled();
  });

  it("preserves the token_hash path: verifyOtp + redirect (no mint)", async () => {
    vi.mocked(isDevLoginEnabled).mockReturnValue(true);
    mockVerifyOtp(null);

    const res = await GET(req("?token_hash=CLI-HASH"));

    expect(mintDevToken).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("https://app.example/home");
  });

  it("email path: mints, verifies, redirects to next", async () => {
    vi.mocked(isDevLoginEnabled).mockReturnValue(true);
    vi.mocked(mintDevToken).mockResolvedValue("MINTED-HASH");
    mockVerifyOtp(null);

    const res = await GET(req("?email=a@b.test&next=/home"));

    expect(mintDevToken).toHaveBeenCalledWith("a@b.test");
    expect(res.headers.get("location")).toBe("https://app.example/home");
  });

  it("format=token path: returns hashed_token as JSON without setting a cookie", async () => {
    vi.mocked(isDevLoginEnabled).mockReturnValue(true);
    vi.mocked(mintDevToken).mockResolvedValue("MINTED-HASH");

    const res = await GET(req("?email=a@b.test&format=token"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ hashed_token: "MINTED-HASH" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("maps a DevLoginError(400) from mint to a 400 response", async () => {
    vi.mocked(isDevLoginEnabled).mockReturnValue(true);
    vi.mocked(mintDevToken).mockRejectedValue(new DevLoginError(400, "email not in allowlist"));

    const res = await GET(req("?email=x@b.test"));

    expect(res.status).toBe(400);
  });

  it("redirects to login with an error when no token_hash or email is given", async () => {
    vi.mocked(isDevLoginEnabled).mockReturnValue(true);

    const res = await GET(req(""));

    expect(res.headers.get("location")).toContain("/login?error=dev_login_missing_params");
  });
});

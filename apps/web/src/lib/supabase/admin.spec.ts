import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("adminClient()", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("throws at call-time (not import-time) when SUPABASE_SECRET_KEY missing", async () => {
    process.env.SUPABASE_SECRET_KEY = "";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";

    const mod = await import("./admin");
    expect(() => mod.adminClient()).toThrow(/SUPABASE_SECRET_KEY/);
  });

  it("returns a client when keys are present", async () => {
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    const { adminClient } = await import("./admin");
    expect(typeof adminClient().from).toBe("function");
  });

  it("memoizes the client across calls", async () => {
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    const { adminClient } = await import("./admin");
    expect(adminClient()).toBe(adminClient());
  });
});

// @vitest-environment node
// Phase 5-2 — fetchMyChallenges viewer-keyed cache directive 검증.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  }),
}));

describe("fetchMyChallenges (Phase 5-2 cache)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses user-keyed cacheTag + minutes life", async () => {
    const { cacheTag, cacheLife } = await import("next/cache");
    const { fetchMyChallenges } = await import("./my-challenges");
    await fetchMyChallenges("user-xyz");
    expect(cacheTag).toHaveBeenCalledWith("user-user-xyz-my-challenges");
    expect(cacheLife).toHaveBeenCalledWith("minutes");
  });
});

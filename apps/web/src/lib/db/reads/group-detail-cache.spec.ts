// @vitest-environment node
// Phase 5-3 — fetchGroupDetail viewer-keyed primary + group secondary tag 검증.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

// hotfix: outer 가 getAuthedUser() 를 사용 — 직접 mock 으로 React cache() 우회.
vi.mock("@/lib/supabase/auth", () => ({
  getAuthedUser: vi.fn().mockResolvedValue({ user: { id: "viewer-1" } }),
}));

const groupsMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "groups") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                maybeSingle: groupsMaybeSingle,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  }),
}));

describe("fetchGroupDetail (Phase 5-3 cache)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses viewer-keyed primary + group-keyed secondary cacheTag with minutes life", async () => {
    const { cacheTag, cacheLife } = await import("next/cache");
    const { fetchGroupDetail } = await import("./group-detail");
    await fetchGroupDetail("group-abc");
    expect(cacheTag).toHaveBeenCalledWith("user-viewer-1-group-group-abc", "group-group-abc");
    expect(cacheLife).toHaveBeenCalledWith("minutes");
  });
});

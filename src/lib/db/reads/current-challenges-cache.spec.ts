// @vitest-environment node
// Phase 5-1 — fetchCurrentChallenges 가 viewer-keyed private cache directive 를
// 선언하는지 확인. inner 함수가 cacheTag/cacheLife 를 어떻게 호출하는지가 검증 대상.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }),
  }),
}));

describe("fetchCurrentChallenges (Phase 5-1 cache)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses 'use cache: private' directive with user-keyed tag", async () => {
    const { cacheTag, cacheLife } = await import("next/cache");
    const { fetchCurrentChallenges } = await import("./current-challenges");

    // RLS 가 빈 결과 반환해도 cacheTag 는 호출돼야 함.
    await fetchCurrentChallenges("user-abc");

    expect(cacheTag).toHaveBeenCalledWith("user-user-abc-home-feed");
    expect(cacheLife).toHaveBeenCalledWith("minutes");
  });
});

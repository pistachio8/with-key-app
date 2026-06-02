// src/lib/db/reads/me.spec.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

import { readHasEverCreatedChallenge } from "./me";

type GroupsResp = { data: { id: string }[] | null; error: unknown };
type ChallengesResp = { data: { id: string }[] | null; error: unknown };

function fakeClient(opts: { groups: GroupsResp; challenges?: ChallengesResp }) {
  // 두 번째 쿼리(`challenges`)가 호출됐는지 추적해 단락 평가 검증에 사용.
  const challengesCalled = vi.fn();

  const groupsBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue(opts.groups),
  };

  const challengesBuilder = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(async () => {
      challengesCalled();
      return opts.challenges ?? { data: [], error: null };
    }),
  };

  const client = {
    from: vi.fn((table: string) => {
      if (table === "groups") return groupsBuilder;
      if (table === "challenges") return challengesBuilder;
      throw new Error(`unexpected table: ${table}`);
    }),
  };

  return { client, challengesCalled };
}

describe("readHasEverCreatedChallenge", () => {
  it("owner 인 그룹이 0건 → false · challenges 쿼리는 호출되지 않는다", async () => {
    const { client, challengesCalled } = fakeClient({
      groups: { data: [], error: null },
    });
    const result = await readHasEverCreatedChallenge(
      client as unknown as Parameters<typeof readHasEverCreatedChallenge>[0],
      "user-1",
    );
    expect(result).toBe(false);
    expect(challengesCalled).not.toHaveBeenCalled();
  });

  it("owner 그룹은 있지만 challenge row 가 0건 → false", async () => {
    const { client } = fakeClient({
      groups: { data: [{ id: "g-1" }], error: null },
      challenges: { data: [], error: null },
    });
    const result = await readHasEverCreatedChallenge(
      client as unknown as Parameters<typeof readHasEverCreatedChallenge>[0],
      "user-1",
    );
    expect(result).toBe(false);
  });

  it("owner 그룹에서 challenge 1건+ 존재 → true (어떤 status 든)", async () => {
    const { client } = fakeClient({
      groups: { data: [{ id: "g-1" }], error: null },
      challenges: { data: [{ id: "c-1" }], error: null },
    });
    const result = await readHasEverCreatedChallenge(
      client as unknown as Parameters<typeof readHasEverCreatedChallenge>[0],
      "user-1",
    );
    expect(result).toBe(true);
  });

  it("groups 쿼리 에러 → false (fail-safe)", async () => {
    const { client, challengesCalled } = fakeClient({
      groups: { data: null, error: { message: "boom" } },
    });
    const result = await readHasEverCreatedChallenge(
      client as unknown as Parameters<typeof readHasEverCreatedChallenge>[0],
      "user-1",
    );
    expect(result).toBe(false);
    expect(challengesCalled).not.toHaveBeenCalled();
  });

  it("challenges 쿼리 에러 → false (fail-safe)", async () => {
    const { client } = fakeClient({
      groups: { data: [{ id: "g-1" }], error: null },
      challenges: { data: null, error: { message: "boom" } },
    });
    const result = await readHasEverCreatedChallenge(
      client as unknown as Parameters<typeof readHasEverCreatedChallenge>[0],
      "user-1",
    );
    expect(result).toBe(false);
  });
});

// Phase 5-1 cache directives — fetchMyDisplayName / hasEverCreatedChallenge.
describe("fetchMyDisplayName (Phase 5-1 cache)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn().mockResolvedValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    }));
  });

  it("uses user-keyed cacheTag + hours life", async () => {
    const { cacheTag, cacheLife } = await import("next/cache");
    const { fetchMyDisplayName } = await import("./me");
    await fetchMyDisplayName("user-abc");
    expect(cacheTag).toHaveBeenCalledWith("user-user-abc-display-name");
    expect(cacheLife).toHaveBeenCalledWith("hours");
  });
});

describe("hasEverCreatedChallenge (Phase 5-1 cache)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn().mockResolvedValue({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "groups") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            };
          }
          throw new Error(`unexpected table ${table}`);
        }),
      }),
    }));
  });

  it("uses user-keyed cacheTag + days life", async () => {
    const { cacheTag, cacheLife } = await import("next/cache");
    const { hasEverCreatedChallenge } = await import("./me");
    await hasEverCreatedChallenge("user-abc");
    expect(cacheTag).toHaveBeenCalledWith("user-user-abc-has-created");
    expect(cacheLife).toHaveBeenCalledWith("days");
  });
});

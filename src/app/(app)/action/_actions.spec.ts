// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const generateMock = vi.fn();
vi.mock("@/lib/ai/diary", () => ({
  generateDiary: (input: unknown, opts: unknown) => generateMock(input, opts),
}));
vi.mock("@/lib/analytics/track", () => ({ track: vi.fn() }));

const maybeSingleUser = vi.fn();
const insertLog = vi.fn();
const supabaseMock = {
  from: (table: string) => {
    if (table === "users") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: maybeSingleUser }) }),
      };
    }
    if (table === "challenge_participants") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    user_id: "22222222-2222-4222-8222-222222222222",
                    challenges: {
                      status: "active",
                      start_at: new Date(Date.now() - 60_000).toISOString(),
                      end_at: new Date(Date.now() + 86_400_000).toISOString(),
                    },
                  },
                  error: null,
                }),
            }),
          }),
        }),
      };
    }
    if (table === "action_logs") {
      return {
        insert: () => ({
          select: () => ({
            single: () => insertLog(),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => supabaseMock,
}));

vi.mock("@/lib/auth/with-user", () => ({
  withUser:
    <I, O>(fn: (u: { id: string; email: string }, i: I) => Promise<O>) =>
    (input: I) =>
      fn({ id: "22222222-2222-4222-8222-222222222222", email: "u@test.local" }, input),
}));

import { submitActionLog } from "./_actions";

beforeEach(() => {
  generateMock.mockReset();
  maybeSingleUser.mockReset();
  insertLog.mockReset();
  generateMock.mockResolvedValue({
    summary: "AI summary",
    fallback: false,
    keywordCoverage: 1,
    latencyMs: 100,
    promptVersion: "v1",
  });
  insertLog.mockResolvedValue({
    data: { id: "33333333-3333-4333-8333-333333333333" },
    error: null,
  });
});

const validInput = {
  challengeId: "11111111-1111-4111-8111-111111111111",
  activityType: "gym" as const,
  photoUrl: "https://example.com/p.jpg",
  selectedKeywords: ["펌핑"],
  shownKeywords: ["펌핑", "집중"],
  rerollCount: 0,
};

describe("submitActionLog", () => {
  it("passes users.display_name into generateDiary", async () => {
    maybeSingleUser.mockResolvedValue({ data: { display_name: "지우" }, error: null });
    await submitActionLog(validInput);
    expect(generateMock).toHaveBeenCalledWith(
      expect.objectContaining({ activityType: "gym", keywords: ["펌핑"] }),
      expect.objectContaining({ displayName: "지우" }),
    );
  });

  it("passes undefined displayName when profile has no display_name", async () => {
    maybeSingleUser.mockResolvedValue({ data: null, error: null });
    await submitActionLog(validInput);
    expect(generateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ displayName: undefined }),
    );
  });
});

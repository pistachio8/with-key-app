import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: createMock } };
  },
}));

const rpcMock = vi.fn();
const selectChain = {
  eq: () => ({
    eq: () => ({
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    }),
  }),
};
const fromMock = vi.fn(() => ({ select: () => selectChain }));

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({
    rpc: rpcMock,
    from: fromMock,
  }),
}));

import { generateDiary, templateFallback } from "./diary";

function okCompletion(content: string, { prompt = 200, completion = 150 } = {}) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: prompt, completion_tokens: completion },
  };
}

beforeEach(() => {
  createMock.mockReset();
  rpcMock.mockReset();
  fromMock.mockClear();
  rpcMock.mockResolvedValue({ data: 0, error: null });
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
  vi.stubEnv("AI_MONTHLY_BUDGET_KRW", "50000");
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => vi.unstubAllEnvs());

describe("generateDiary", () => {
  it("returns AI summary when keywords covered and records cost", async () => {
    createMock.mockResolvedValue(okCompletion("오늘 헬스에서 펌핑이 제대로 왔어요."));
    const r = await generateDiary({
      activityType: "gym",
      keywords: ["펌핑"],
    });
    expect(r.fallback).toBe(false);
    expect(r.summary).toContain("펌핑");
    expect(rpcMock).toHaveBeenCalledWith(
      "add_ai_cost",
      expect.objectContaining({ p_scope: "test" }),
    );
  });

  it("falls back to template when AI response misses keyword (no retry)", async () => {
    createMock.mockResolvedValue(okCompletion("오늘 운동 좋았어요."));
    const r = await generateDiary({
      activityType: "gym",
      keywords: ["하체"],
    });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(r.fallback).toBe(true);
    expect(r.summary).toContain("하체");
  });

  it("skips OpenAI entirely when monthly budget exceeded", async () => {
    const over = {
      eq: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { total_micros: 999_999_999 }, error: null }),
        }),
      }),
    };
    fromMock.mockReturnValueOnce({ select: () => over } as never);

    const r = await generateDiary({
      activityType: "gym",
      keywords: ["펌핑"],
    });
    expect(createMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(r.fallback).toBe(true);
    expect(r.summary).toContain("펌핑");
  });

  it("falls back with template when OPENAI_API_KEY missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const r = await generateDiary({ activityType: "gym", keywords: ["펌핑"] });
    expect(createMock).not.toHaveBeenCalled();
    expect(r.fallback).toBe(true);
    expect(r.summary).toContain("펌핑");
  });

  it("writes the template fallback in first-person diary tone with keywords", () => {
    const out = templateFallback({ activityType: "gym", keywords: ["스쿼트"] }, "지우");
    expect(out).toContain("스쿼트");
    // First-person diary — no name, no cheering.
    expect(out).not.toContain("지우");
    expect(out).not.toMatch(/수고하셨|화이팅|대단해요|잘했어요/);
  });

  it("records cost against scope='prod' when VERCEL_ENV is production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    createMock.mockResolvedValue(okCompletion("오늘 헬스에서 펌핑이 제대로 왔어요."));
    await generateDiary({ activityType: "gym", keywords: ["펌핑"] });
    expect(rpcMock).toHaveBeenCalledWith(
      "add_ai_cost",
      expect.objectContaining({ p_scope: "prod" }),
    );
  });

  it("records cost against scope='test' on preview deployments", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    createMock.mockResolvedValue(okCompletion("오늘 헬스에서 펌핑이 제대로 왔어요."));
    await generateDiary({ activityType: "gym", keywords: ["펌핑"] });
    expect(rpcMock).toHaveBeenCalledWith(
      "add_ai_cost",
      expect.objectContaining({ p_scope: "test" }),
    );
  });
});

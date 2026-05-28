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

describe("generateDiary — meal 끼니 context (PROMPT_VERSION v4)", () => {
  function userPromptOf(): string {
    return createMock.mock.calls[0][0].messages[1].content as string;
  }

  it("injects the inferred slot as soft context for meal", async () => {
    createMock.mockResolvedValue(okCompletion("점심으로 샐러드 챙겨 먹었어요. 든든했어요."));
    const r = await generateDiary({ activityType: "meal", keywords: ["샐러드"], mealSlot: "점심" });
    expect(r.fallback).toBe(false);
    expect(r.keywordCoverage).toBe(1);
    expect(userPromptOf()).toContain("식사 시간대: 점심");
  });

  it("omits the slot line for non-meal activity", async () => {
    createMock.mockResolvedValue(okCompletion("오늘 헬스에서 펌핑이 제대로 왔어요."));
    await generateDiary({ activityType: "gym", keywords: ["펌핑"] });
    expect(userPromptOf()).not.toContain("식사 시간대");
  });

  it("does not count the slot word toward keyword coverage", async () => {
    // AI 가 끼니(점심)는 넣되 필수 키워드(샐러드)를 빠뜨리면 coverage<1 → fallback 유지.
    createMock.mockResolvedValue(okCompletion("점심으로 가볍게 먹었어요."));
    const r = await generateDiary({ activityType: "meal", keywords: ["샐러드"], mealSlot: "점심" });
    expect(r.fallback).toBe(true);
    expect(r.summary).toContain("샐러드");
  });

  it("template fallback for meal uses 식사 tone with the slot (no 운동 framing)", () => {
    const out = templateFallback({ activityType: "meal", keywords: ["샐러드"], mealSlot: "야식" });
    expect(out).toContain("야식");
    expect(out).toContain("샐러드");
    expect(out).toContain("먹었어요");
    expect(out).not.toContain("몸에 힘이 붙은");
  });
});

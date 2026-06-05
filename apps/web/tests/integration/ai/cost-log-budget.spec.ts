import { afterEach, describe, expect, it, vi } from "vitest";
import { generateDiary } from "@/lib/ai/diary";
import { admin } from "../setup";

afterEach(() => vi.unstubAllEnvs());

describe("ai_cost_log budget guard", () => {
  it("skips OpenAI when current (month, scope='test') exceeds budget", async () => {
    vi.stubEnv("AI_MONTHLY_BUDGET_KRW", "14");
    vi.stubEnv("OPENAI_API_KEY", "sk-should-not-be-used");
    vi.stubEnv("VERCEL_ENV", ""); // absent → currentScope() returns "test"

    const seeded = await admin.rpc("add_ai_cost", { p_micros: 50_000, p_scope: "test" });
    expect(seeded.error).toBeNull();

    const started = Date.now();
    const r = await generateDiary({
      activityType: "gym",
      keywords: ["펌핑"],
    });
    const elapsed = Date.now() - started;

    expect(r.fallback).toBe(true);
    expect(r.summary).toContain("펌핑");
    expect(elapsed).toBeLessThan(500);
  });
});

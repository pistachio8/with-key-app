import OpenAI from "openai";
import { adminClient } from "@/lib/supabase/admin";
import { estimateCostMicros, monthlyBudgetMicros } from "./cost";
import { PROMPT_VERSION, SYSTEM_PROMPT, buildUserPrompt, type DiaryPromptInput } from "./prompts";

const AI_TIMEOUT_MS = 4500; // PRD §5.3 AC-4: P95 < 5초, 0.5s 버퍼

export type DiaryResult = {
  summary: string;
  fallback: boolean;
  keywordCoverage: number; // 포함된 키워드 수 / 선택 수
  latencyMs: number;
  promptVersion: string;
};

const ACTIVITY_LABEL_KO: Record<DiaryPromptInput["activityType"], string> = {
  running: "러닝",
  gym: "헬스",
  yoga: "요가",
  other: "운동",
  meal: "식단",
};

export function templateFallback(input: DiaryPromptInput, _displayName = "회원"): string {
  void _displayName; // retained for signature back-compat; diary is first-person now.
  const kw = input.keywords.join(" · ");
  // meal 은 운동 프레이밍("몸에 힘이 붙은") 대신 식사 톤. mealSlot 있으면 끼니를 자연스레 반영.
  if (input.activityType === "meal") {
    const slot = input.mealSlot ? `${input.mealSlot}으로 ` : "";
    const tail = kw ? `${kw} 챙겨 먹었어요.` : "잘 챙겨 먹었어요.";
    return `오늘 ${slot}${tail} 🥗`;
  }
  const label = ACTIVITY_LABEL_KO[input.activityType];
  return `오늘 ${label} 했어요. ${kw} 느낌으로 몸에 힘이 붙은 하루였어요. 🔥`;
}

function keywordCoverage(summary: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const hit = keywords.filter((kw) => summary.includes(kw)).length;
  return hit / keywords.length;
}

function currentMonthIso(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function currentScope(): "prod" | "test" {
  // VERCEL_ENV distinguishes preview from production; NODE_ENV cannot (both are
  // "production" on Vercel). Preview budget must stay isolated under D-014.
  return process.env.VERCEL_ENV === "production" ? "prod" : "test";
}

async function readCurrentMonthCostMicros(scope: "prod" | "test"): Promise<number> {
  try {
    const { data, error } = await adminClient()
      .from("ai_cost_log")
      .select("total_micros")
      .eq("month", currentMonthIso())
      .eq("scope", scope)
      .maybeSingle();

    if (error || !data) return 0;
    return Number(data.total_micros ?? 0);
  } catch (error) {
    console.error("[generateDiary] read ai_cost_log failed", error);
    return 0;
  }
}

async function logCost(micros: number, scope: "prod" | "test"): Promise<void> {
  try {
    const { error } = await adminClient().rpc("add_ai_cost", {
      p_micros: micros,
      p_scope: scope,
    });
    if (error) console.error("[generateDiary] add_ai_cost failed", error);
  } catch (error) {
    console.error("[generateDiary] add_ai_cost failed", error);
  }
}

function templateResult(
  input: DiaryPromptInput,
  displayName: string | undefined,
  started: number,
): DiaryResult {
  return {
    summary: templateFallback(input, displayName),
    fallback: true,
    keywordCoverage: 0,
    latencyMs: Date.now() - started,
    promptVersion: PROMPT_VERSION,
  };
}

export async function generateDiary(
  input: DiaryPromptInput,
  options: { displayName?: string; signal?: AbortSignal } = {},
): Promise<DiaryResult> {
  const started = Date.now();
  const scope = currentScope();

  const budget = monthlyBudgetMicros();
  const spent = await readCurrentMonthCostMicros(scope);
  if (spent >= budget) {
    return templateResult(input, options.displayName, started);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  if (!apiKey) return templateResult(input, options.displayName, started);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(input) },
        ],
        temperature: 0.7,
        max_tokens: 220,
      },
      { signal: controller.signal },
    );

    const usage = completion.usage;
    if (usage) {
      const micros = estimateCostMicros({
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
      });
      if (micros > 0) await logCost(micros, scope);
    }

    const summary = completion.choices[0]?.message?.content?.trim() ?? "";
    const coverage = keywordCoverage(summary, input.keywords);

    if (!summary || coverage < 1) {
      return templateResult(input, options.displayName, started);
    }

    return {
      summary,
      fallback: false,
      keywordCoverage: coverage,
      latencyMs: Date.now() - started,
      promptVersion: PROMPT_VERSION,
    };
  } catch (error) {
    console.error("[generateDiary] call failed", error);
    return templateResult(input, options.displayName, started);
  } finally {
    clearTimeout(timeout);
  }
}

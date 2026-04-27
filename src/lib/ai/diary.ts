import OpenAI from "openai";
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
};

export function templateFallback(input: DiaryPromptInput, displayName = "회원"): string {
  const label = ACTIVITY_LABEL_KO[input.activityType];
  const kw = input.keywords.join(" · ");
  return `${displayName}님, 오늘 ${label}에서 ${kw} 🔥 수고하셨어요!`;
}

function keywordCoverage(summary: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const hit = keywords.filter((kw) => summary.includes(kw)).length;
  return hit / keywords.length;
}

export async function generateDiary(
  input: DiaryPromptInput,
  options: { displayName?: string; signal?: AbortSignal } = {},
): Promise<DiaryResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  try {
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY missing");
    }
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

    const summary = completion.choices[0]?.message?.content?.trim() ?? "";
    const coverage = keywordCoverage(summary, input.keywords);

    if (!summary || coverage < 1) {
      // PRD §5.3 AC-3: 누락 시 템플릿 폴백 (self-retry는 추후 PR)
      return {
        summary: templateFallback(input, options.displayName),
        fallback: true,
        keywordCoverage: coverage,
        latencyMs: Date.now() - started,
        promptVersion: PROMPT_VERSION,
      };
    }

    return {
      summary,
      fallback: false,
      keywordCoverage: coverage,
      latencyMs: Date.now() - started,
      promptVersion: PROMPT_VERSION,
    };
  } catch {
    return {
      summary: templateFallback(input, options.displayName),
      fallback: true,
      keywordCoverage: 0,
      latencyMs: Date.now() - started,
      promptVersion: PROMPT_VERSION,
    };
  } finally {
    clearTimeout(timeout);
  }
}

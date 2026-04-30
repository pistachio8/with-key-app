// OpenAI gpt-4o-mini pricing snapshot used by this POC:
// input = $0.15 per 1M tokens, output = $0.60 per 1M tokens.
// Verify on model upgrade.
const INPUT_USD_PER_TOKEN = 0.15 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 0.6 / 1_000_000;

const USD_TO_KRW = 1400;
const DEFAULT_MONTHLY_BUDGET_KRW = 50_000;
const MICROS_PER_CENT = 10_000;

type Tokens = { inputTokens: number; outputTokens: number };

export function estimateCostMicros({ inputTokens, outputTokens }: Tokens): number {
  const usd = inputTokens * INPUT_USD_PER_TOKEN + outputTokens * OUTPUT_USD_PER_TOKEN;
  return Math.round(usd * 100 * MICROS_PER_CENT + 1e-9);
}

export function costMicrosToKrw(micros: number): number {
  const usd = micros / (100 * MICROS_PER_CENT);
  return Math.round(usd * USD_TO_KRW);
}

export function monthlyBudgetMicros(): number {
  const raw = process.env.AI_MONTHLY_BUDGET_KRW;
  const parsed = raw && raw.length > 0 ? Number(raw) : DEFAULT_MONTHLY_BUDGET_KRW;
  const krw = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MONTHLY_BUDGET_KRW;
  const usd = krw / USD_TO_KRW;
  const cents = Math.floor(usd * 100);
  return cents * MICROS_PER_CENT;
}

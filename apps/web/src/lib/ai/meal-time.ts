// meal 활동의 업로드 시각(서버 epoch ms)을 KST 끼니로 추론한다.
// Vercel 런타임은 UTC 이므로 KST(=UTC+9, DST 없음) 고정 offset 으로 hour 를 산출한다.
// 순수 함수 — 호출부(Server Action)에서 Date.now() 를 주입해 결정적으로 테스트한다.
export type MealSlot = "아침" | "점심" | "저녁" | "야식";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

export function inferMealSlot(epochMs: number): MealSlot {
  const kstHour = Math.floor(((epochMs + KST_OFFSET_MS) / MS_PER_HOUR) % 24);
  if (kstHour >= 5 && kstHour <= 10) return "아침"; // 05~10
  if (kstHour >= 11 && kstHour <= 16) return "점심"; // 11~16
  if (kstHour >= 17 && kstHour <= 21) return "저녁"; // 17~21
  return "야식"; // 22~04 (자정 넘김)
}

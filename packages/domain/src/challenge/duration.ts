// BE_SCHEMA §5.5 · D-006 (1~90일) · Design Brief 화면 2 (1주/2주/4주 + 직접선택)
export const MAX_DURATION_DAYS = 90;

export const DURATION_PRESETS = [
  { label: "1주", days: 7 },
  { label: "2주", days: 14 },
  { label: "4주", days: 28 },
] as const;

export function computeEndAt(start: Date, days: number): Date {
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
}

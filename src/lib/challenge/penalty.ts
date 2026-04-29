// BE_SCHEMA §5.5 · D-007 (1,000~10,000 / 1,000원 단위) · Design Brief 화면 2
export const PENALTY_PRESETS = [1000, 3000, 5000, 10000] as const;

export function formatKRW(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

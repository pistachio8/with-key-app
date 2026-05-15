// BE_SCHEMA §5.5 · D-007 (0~10,000 / 1,000원 단위) · 모킹업 §3-A "없음" 옵션 (#58).
export const PENALTY_PRESETS = [0, 3000, 5000, 10000] as const;

export function formatKRW(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/** 모킹업 §3-A: 0원은 "없음" 라벨. */
export function penaltyLabel(amount: number): string {
  if (amount === 0) return "없음";
  if (amount === 10000) return "만원";
  return `${(amount / 1000).toLocaleString("ko-KR")}천원`;
}

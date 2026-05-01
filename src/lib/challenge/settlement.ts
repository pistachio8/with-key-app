// PRD §1.2 · §11.2 — POC 은 벌금 "표시만". 실제 정산은 v1 이후.
// 규칙: doneCount >= goalCount 성공 · 그 외 per-head = penaltyAmount (분할 계산 없음).

export type SettlementInput = {
  doneCount: number;
  goalCount: number;
  penaltyAmount: number;
};

export function computePerHeadPenalty(input: SettlementInput): number {
  const { doneCount, goalCount, penaltyAmount } = input;
  if (!Number.isFinite(penaltyAmount) || penaltyAmount <= 0) return 0;
  if (doneCount >= goalCount) return 0;
  return penaltyAmount;
}

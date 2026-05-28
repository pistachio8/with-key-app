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

export type AccruedPotInput = {
  status: "pending" | "accepted" | "active" | "closed";
  goalCount: number;
  penaltyAmount: number;
  members: ReadonlyArray<{ doneCount: number }>;
};

// "모인 예정 벌금" 합계 — 미시작(pending/accepted) 챌린지는 실패가 성립하지 않아 0,
// active/closed 만 per-head 합산. 인원수 × 벌금(최대값)이 아니라 실제 미달자 기준.
export function computeAccruedPot(input: AccruedPotInput): number {
  if (input.status !== "active" && input.status !== "closed") return 0;
  return input.members.reduce(
    (sum, m) =>
      sum +
      computePerHeadPenalty({
        doneCount: m.doneCount,
        goalCount: input.goalCount,
        penaltyAmount: input.penaltyAmount,
      }),
    0,
  );
}

export type MvpInput = {
  goalCount: number;
  members: ReadonlyArray<{ id: string; doneCount: number }>;
};

export function pickMvpIds(input: MvpInput): ReadonlyArray<string> {
  const achievers = input.members.filter((m) => m.doneCount >= input.goalCount);
  if (achievers.length === 0) return [];
  const max = Math.max(...achievers.map((m) => m.doneCount));
  return achievers.filter((m) => m.doneCount === max).map((m) => m.id);
}

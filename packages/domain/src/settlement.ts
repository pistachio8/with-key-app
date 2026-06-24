// P1 정산 분배의 결정론 코어 (greenfield · EVAL-0006 · ADR-0032).
// web(apps/web)과 후속 RN(apps/mobile), 그리고 SQL 정산 RPC(0044)가 공유하는 단일 산식.
//
// 원장 sign 규약 — "release-full + penalty":
//   1. 서약 시  deposit_hold   delta = -H  (보증금을 적립 잔액에서 hold)
//   2. 정산 시  deposit_release delta = +H  (보증금 전액 환급)
//   3. 정산 시  penalty         delta = -F  (미달분 F 만 재차감, F = min(H, confirmedPenalty))
//
// 이 규약을 쓰는 이유:
//   · 달성자(F=0)는 release(+H) 한 줄로 net 0 — 보증금 전액 환급(AC-settle-1).
//   · 미달자는 release(+H)·penalty(-F)로 net -F — 미달분만 손실, 보증금 한도 내.
//   · 모든 금전 이동이 append-only 원장에 "명시 행"으로 남아 감사·분쟁 추적 가능(AC-settle-7).
//   · 미달분 합 F 는 그룹 공동 주머니(settlements.pool_points)로만 적재 — 개인↔개인
//     재분배 원장 행이 없다(도박 위험 회피, AC-settle-6).
//   · 잔액은 항상 Σdelta 로만 도출되어 balance 컬럼 drift 가 구조적으로 불가능(AC-deposit-hold-5).
//
// confirmedPenalty(미달분, 주 단위 누적)는 본 모듈이 산정하지 않는다 — 그 SoT 는
// apps/web/src/lib/challenge/weekly.ts(`confirmedPenalty`)이고 SQL 정산 RPC 는 동일 산식을
// 포팅한다. 본 모듈은 "산출된 미달분"을 입력으로 받아 분배·원장 행·풀을 결정론으로 만든다.

// penalty_debt_carryover: 벌칙 미인정(rejected/expired) 시 2X 빚이 같은 그룹 다음 챌린지 정산에
//   이월 차감되는 reason(ADR-0039 carry-over). 타입은 0042 에서 미리 추가하되, DB CHECK 확장과 실제
//   INSERT 경로는 0054(EVAL-0045) 에서 활성화한다 — 0042 단계에선 이 reason 으로 원장 행을 만들지 않는다.
export type SettlementReason = "deposit_release" | "penalty" | "penalty_debt_carryover";

export type SettlementInput = {
  userId: string;
  /** H — 서약 시 hold 된 보증금(deposit_hold 절댓값). 음수·비정수는 0/내림 처리. */
  heldDeposit: number;
  /** 끝난 주 누적 미달분(weekly.ts `confirmedPenalty`). binary 아님(주 단위 합). */
  confirmedPenalty: number;
};

export type SettlementLedgerEntry = {
  userId: string;
  /** signed: deposit_release = +H, penalty = -F. CHECK(delta<>0) 보존 — 0 행은 만들지 않는다. */
  delta: number;
  reason: SettlementReason;
};

export type SettlementShare = {
  /** 환급액(= heldDeposit, 전액 환급). */
  released: number;
  /** 미달분 차감액 = min(heldDeposit, confirmedPenalty). 보증금 한도 초과분은 P1 미징수. */
  forfeit: number;
  /** 보증금 기준 순손익 = released - forfeit = H - F (>= 0). */
  net: number;
};

export type SettlementResult = {
  /** 정산 확정 시 point_ledger 에 append 할 원장 행. */
  entries: SettlementLedgerEntry[];
  /** Σ forfeit → settlements.pool_points (그룹 공동 주머니로 이월). */
  poolPoints: number;
  /** 확정 시점 분배 스냅샷 → settlements.distribution(사후 재계산 금지, AC-settle-5). */
  distribution: Record<string, SettlementShare>;
  /**
   * 벌칙 챌린지(penalty_mission 있음): penalty 를 deferred 처리해 이 스냅샷이 최종 미달분을 담지 않음을
   * 표시하는 메타. redemption 창(종료+48~96h) 결과가 forward(carry-over)로 반영된다(ADR-0039 §C5).
   * settlements.distribution 에 redemption_pending 키로 미러된다(SQL settle_challenge). 기본 false.
   */
  redemptionPending: boolean;
};

export type SettlementOptions = {
  /**
   * 챌린지의 벌칙 미션(challenges.penalty_mission). 비어있지 않으면 penalty 를 deferred 처리한다 —
   * 이 정산에서 미달분(forfeit)을 차감/적재하지 않고 redemption 창에서 forward(ADR-0039). 불변 스냅샷에
   * 아직 확정 전인 X 를 박지 않기 위함이다.
   */
  penaltyMission?: string | null;
};

function toNonNegInt(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.trunc(value);
}

/**
 * 정산 분배를 결정론으로 계산한다. 같은 입력 → 같은 출력(시간·난수 비의존).
 *
 * 호출처(정산 RPC·테스트)는 참가자별 hold 보증금과 confirmedPenalty 를 넘긴다.
 * 반환된 entries 를 그대로 원장에 append 하고 poolPoints 를 settlements 에 적재하면
 * 잔액=Σdelta 가 보존된다.
 */
export function computeSettlement(
  participants: ReadonlyArray<SettlementInput>,
  options?: SettlementOptions,
): SettlementResult {
  // 벌칙 챌린지(penalty_mission 있음)는 deferred — 이 정산에선 forfeit 0(redemption 창에서 forward).
  const deferred = Boolean(options?.penaltyMission && options.penaltyMission.trim().length > 0);
  const entries: SettlementLedgerEntry[] = [];
  const distribution: Record<string, SettlementShare> = {};
  let poolPoints = 0;

  for (const p of participants) {
    const held = toNonNegInt(p.heldDeposit);
    const penalty = toNonNegInt(p.confirmedPenalty);
    // deferred 면 미달분을 차감하지 않는다. 아니면 보증금 한도 — 초과분은 P1 미징수.
    const forfeit = deferred ? 0 : Math.min(held, penalty);
    const released = held; // release-full: 전액 환급
    const net = released - forfeit; // = H - F >= 0 (deferred 면 = H)

    if (released > 0) {
      entries.push({ userId: p.userId, delta: released, reason: "deposit_release" });
    }
    if (forfeit > 0) {
      entries.push({ userId: p.userId, delta: -forfeit, reason: "penalty" });
    }

    distribution[p.userId] = { released, forfeit, net };
    poolPoints += forfeit;
  }

  return { entries, poolPoints, distribution, redemptionPending: deferred };
}

/**
 * 이중 정산 방지(멱등)의 도메인 모델. DB 에서는 settlements.challenge_id PK +
 * `insert ... on conflict do nothing` 으로 강제되며(영향 행 0 → no-op), 본 함수는
 * 그 결정론 거동을 단위 테스트로 검증하기 위한 래퍼다.
 *
 * @param alreadySettled 해당 챌린지에 settlements 행이 이미 있는지
 * @returns 이미 정산됐으면 빈 결과(추가 원장 0행), 아니면 computeSettlement 결과
 */
export function settleOnce(
  alreadySettled: boolean,
  participants: ReadonlyArray<SettlementInput>,
): SettlementResult {
  if (alreadySettled) {
    return { entries: [], poolPoints: 0, distribution: {}, redemptionPending: false };
  }
  return computeSettlement(participants);
}

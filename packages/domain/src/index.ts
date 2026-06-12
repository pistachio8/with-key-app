// @withkey/domain — web(apps/web)과 후속 RN(apps/mobile)이 공유하는 순수 도메인 로직.
// 단일 진입점(barrel): 소비처는 `@withkey/domain` 루트로만 import 한다(상대·subpath import 금지, 04 A2/§1).
export * from "./validators";
export * from "./keywords";
export * from "./challenge";
export * from "./bank";
export * from "./share";
// 화면 read view-model 계약 (EVAL-0016 · ADR-0037) — web read 모듈과 RN read service 가 공유.
export * from "./read-contracts";

// validators/challenge 와 challenge/lifecycle 이 동일한 4-status union `ChallengeStatus` 를
// 각각 export 해 두 패밀리 barrel 의 `export *` 가 충돌(TS2308)한다. zod SoT(validators) 쪽을
// 명시 재export 해 모호성을 제거한다 — 두 타입은 구조적으로 동일.
export type { ChallengeStatus } from "./validators/challenge";

export { pointBalanceFor, type PointBalanceScope, type PointLedgerEntry } from "./point-ledger";
export {
  computeSettlement,
  settleOnce,
  type SettlementInput,
  type SettlementLedgerEntry,
  type SettlementReason,
  type SettlementResult,
  type SettlementShare,
} from "./settlement";

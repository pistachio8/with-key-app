---
Task: EVAL-0061
Track: port
Kind: migration
Status: done
Depends-on: [task:EVAL-0060] — penaltyProofStatusSchema 가 read-contract penalty.ts 에서 import 하므로 EVAL-0060 완료 후 착수 권장.
Parent: docs/superpowers/plans/2026-06-29-rn-settlement-c2-penalty.md
---

# EVAL-0061: C2 penalty write-contract (증명 제출 응답 envelope schema)

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0061` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10). spec: docs/superpowers/specs/2026-06-29-rn-settlement-points-redemption-design.md §C2
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-settlement-c2-penalty` (base: develop, SL0 머지 후)

## Goal

`packages/domain/src/write-contracts/penalty.ts`를 신설해 벌칙 증명 제출 BFF 응답 봉투(`penaltyProofSubmitResponseSchema`)를 `@withkey/domain` 공유 계약으로 정의한다. `submitActionLogResponseSchema`(`write-contracts/action-log.ts`) 패턴을 그대로 미러하며, discriminated union(`ok: true/false`)으로 성공·실패를 분기한다. `mediaPath`처럼 서버 내부 필드는 응답에서 strip한다. RN feature service가 이 schema로 BFF 응답을 zod parse한다(Phase D–E 의존).

상세 구현은 `docs/superpowers/plans/2026-06-29-rn-settlement-c2-penalty.md` Task 2를 따른다.

## Source Files to Inspect

- `packages/domain/src/write-contracts/action-log.ts` — submitActionLogResponseSchema 선례(errorCodeSchema 위치 포함)
- `packages/domain/src/write-contracts/index.ts` — barrel 현황
- `packages/domain/src/validators/penalty.ts` — penaltyProofStatusSchema

## Target Files

- `packages/domain/src/write-contracts/index.ts` — barrel에 `export * from "./penalty"` 추가
- 신규: packages/domain/src/write-contracts/penalty.ts · penalty.spec.ts

## Requirements

- `penaltyProofSubmitResultSchema`: `{ proofId: string, status: PenaltyProofStatus }`. `mediaPath` 등 서버 내부 필드 strip.
- `penaltyProofSubmitResponseSchema`: `z.discriminatedUnion("ok", [...])`. `ok:true` → data, `ok:false` → errorCodeSchema + issues?.
- 알 수 없는 error 코드는 throw(errorCodeSchema 범위 밖).
- `pnpm --filter @withkey/domain test -- write-contracts/penalty` PASS.

## Non-goals

- 제출 코어(`submitPenaltyProofCore`) 구현 — Phase D(EVAL-0068 이후)
- BFF POST route 신설 — Phase D
- RN mutation service — Phase D–E

## Acceptance Criteria

| 기준                                                  | 검증 방법                                                       |
| ----------------------------------------------------- | --------------------------------------------------------------- |
| 성공 봉투 parse(proofId·status 보존, mediaPath strip) | `pnpm --filter @withkey/domain test -- write-contracts/penalty` |
| 실패 봉투 parse(ok:false, error 코드)                 | `pnpm --filter @withkey/domain test -- write-contracts/penalty` |
| 알 수 없는 error 코드 throw                           | `pnpm --filter @withkey/domain test -- write-contracts/penalty` |
| harness 추적성                                        | `pnpm harness:check`                                            |

## Verification Commands

```bash
pnpm --filter @withkey/domain test -- write-contracts/penalty
pnpm --filter @withkey/domain exec tsc --noEmit
pnpm --filter @withkey/domain lint
pnpm harness:check
pnpm validate:docs
```

## Expected Output Summary

`packages/domain/src/write-contracts/penalty.ts`·`penalty.spec.ts` 신규 생성, barrel 추가. write-contract 테스트 PASS를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? write-contracts/penalty.ts는 기존 write-contracts/ 확장.
2. Did this task introduce a new naming convention? 없음.
3. Did this task introduce a new dependency? 없음.
4. Did this task change verification commands? `pnpm --filter @withkey/domain test -- write-contracts/penalty` 신규.
5. Did this task reveal that the current harness instructions are outdated? 판단 필요.
6. Should any `.agents/` document be updated? yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- write-contract 테스트 전 항목 green + `pnpm harness:check` 통과 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → 태스크 과대, split-work-packages로 분할.

---
Task: EVAL-0060
Track: port
Kind: migration
Status: todo
Depends-on: [task:EVAL-0059] — SL0 UI primitive 완료 후 C2 브랜치 베이스가 확정된다.
Parent: docs/superpowers/plans/2026-06-29-rn-settlement-c2-penalty.md
---

# EVAL-0060: C2 penalty read-contract 승격 (PenaltyStatusView/ProofView/WaitingView + zod)

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0060` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10). spec: docs/superpowers/specs/2026-06-29-rn-settlement-points-redemption-design.md §C2
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-settlement-c2-penalty` (base: develop, SL0 머지 후)

## Goal

`packages/domain/src/read-contracts/penalty.ts`를 신설해 web 전용이던 `PenaltyWindowPhase`·`PenaltyProofView`·`PenaltyStatusView`·`PenaltyWaitingView`를 `@withkey/domain` 공유 계약으로 승격한다. transport zod schema(`penaltyStatusViewSchema`·`penaltyProofViewSchema`·`penaltyWindowPhaseSchema`)가 web view-model을 round-trip하고, 익명성 위반 필드(voterId 류)를 strip한다. `apps/web/src/lib/db/reads/penalty-status.ts`의 지역 타입 정의를 domain import re-export로 교체하며, 기존 web consumer(`penalty-proof-card.tsx`)의 import path가 비파괴로 유지된다.

상세 구현은 `docs/superpowers/plans/2026-06-29-rn-settlement-c2-penalty.md` Task 1을 따른다.

## Source Files to Inspect

- `apps/web/src/lib/db/reads/penalty-status.ts` — 지역 타입 정의 블록(PenaltyWindowPhase~PenaltyStatusView)과 기존 consumer import 경로
- `packages/domain/src/read-contracts/feed.ts` — read-contract 구조 선례(feedItemViewSchema·feedResponseSchema 패턴)
- `packages/domain/src/read-contracts/index.ts` — barrel 현황
- `packages/domain/src/validators/penalty.ts` — penaltyProofStatusSchema 위치(import 의존)

## Target Files

- `packages/domain/src/read-contracts/index.ts` — barrel에 `export * from "./penalty"` 추가
- `apps/web/src/lib/db/reads/penalty-status.ts` — 지역 타입 블록 → domain import re-export 치환
- 신규: packages/domain/src/read-contracts/penalty.ts · penalty.spec.ts

## Requirements

- `penaltyWindowPhaseSchema`: `z.enum(["before","open","expired"])`. "running" 같은 외부 값 거부.
- `penaltyProofViewSchema`: `penaltyProofStatusSchema` 재사용. `voterId`·`rejecterIds` 같은 익명성 위반 필드 strip(strict object).
- `penaltyStatusViewSchema`: round-trip 완전(모든 필드 보존).
- `PenaltyWaitingView`: 순수 RLS read라 transport zod 없이 타입만 export.
- web `penalty-status.ts` 지역 타입 블록을 domain import + re-export로 교체 → 기존 consumer import path 비파괴.
- `pnpm --filter @withkey/domain test -- penalty` PASS.
- `pnpm --filter web exec tsc --noEmit` PASS.

## Non-goals

- write-contract(증명 제출 응답) — EVAL-0061
- web 주입 변형 추출 — EVAL-0063
- BFF route 신설 — EVAL-0064
- RN feature service — EVAL-0066

## Acceptance Criteria

| 기준                                                                | 검증 방법                                       |
| ------------------------------------------------------------------- | ----------------------------------------------- |
| penaltyWindowPhaseSchema "before/open/expired" 수용, "running" 거부 | `pnpm --filter @withkey/domain test -- penalty` |
| penaltyProofViewSchema round-trip + voterId strip                   | `pnpm --filter @withkey/domain test -- penalty` |
| penaltyStatusViewSchema VIEW fixture round-trip                     | `pnpm --filter @withkey/domain test -- penalty` |
| web penalty-status.ts 타입 치환 후 consumer 비파괴(typecheck)       | `pnpm --filter web exec tsc --noEmit`           |
| harness 추적성                                                      | `pnpm harness:check`                            |

## Verification Commands

```bash
pnpm --filter @withkey/domain test -- penalty
pnpm --filter web exec tsc --noEmit
pnpm --filter @withkey/domain lint
pnpm harness:check
pnpm validate:docs
```

## Expected Output Summary

`packages/domain/src/read-contracts/penalty.ts`·`penalty.spec.ts` 신규 생성, barrel 추가, `penalty-status.ts` 지역 타입 블록을 domain re-export로 교체. domain test PASS, web typecheck PASS를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? read-contracts/penalty.ts는 기존 read-contracts/ 확장.
2. Did this task introduce a new naming convention? 없음.
3. Did this task introduce a new dependency? 없음(기존 zod 재사용).
4. Did this task change verification commands? `pnpm --filter @withkey/domain test -- penalty` 신규.
5. Did this task reveal that the current harness instructions are outdated? 판단 필요.
6. Should any `.agents/` document be updated? yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- penalty schema 테스트 전 항목 green + web typecheck PASS + `pnpm harness:check` 통과 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → 태스크 과대, split-work-packages로 분할.

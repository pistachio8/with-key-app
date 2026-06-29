---
Task: EVAL-0065
Track: greenfield
Kind: migration
Status: done
Depends-on: [task:EVAL-0060] — PenaltyStatusView·PenaltyWaitingView 타입이 domain에 있어야 fixture가 type-safe하다.
Parent: docs/superpowers/plans/2026-06-29-rn-settlement-c2-penalty.md
---

# EVAL-0065: penalty-status/penalty-waiting 패리티 fixture + schema 수용 테스트

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0065` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10). spec: docs/superpowers/specs/2026-06-29-rn-settlement-points-redemption-design.md §C2
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-settlement-c2-penalty` (base: develop, SL0 머지 후)

## Goal

`evals/fixtures/read-contracts/penalty-status.ts`와 `penalty-waiting.ts`를 신설한다. `penalty-status`는 BFF 경로 transport snapshot — `penaltyStatusViewSchema`가 `PENALTY_STATUS_EXPECTED`를 round-trip한다는 domain schema 수용 테스트를 `packages/domain/src/read-contracts/penalty.spec.ts`에 추가해 검증한다. `penalty-waiting`은 RLS-direct 조립 snapshot — mock supabase 필터 no-op 특성을 감안해 창2 게이트([종료+48h,+96h]) + viewer 서약 멤버십 in-memory 변별을 EXPECTED(cw1만)로 고정한다. EVAL-0066(RN penalty-reads)이 같은 fixture를 공유해 BFF round-trip·waiting 필터를 검증한다.

상세 구현은 `docs/superpowers/plans/2026-06-29-rn-settlement-c2-penalty.md` Task 6을 따른다.

## Source Files to Inspect

- `evals/fixtures/read-contracts/feed.ts` — 기존 fixture 구조 확인(feed 선례)
- `packages/domain/src/read-contracts/index.ts` — PenaltyStatusView·PenaltyWaitingView 타입 노출 확인(EVAL-0060 산출물 의존)
- `apps/mobile/src/shared/testing/mock-supabase.ts` — MockTables 타입(EVAL-0066이 이 fixture를 쓸 때 필요)

## Target Files

- `packages/domain/src/read-contracts/index.ts` — parity 테스트 describe 추가(penalty.spec.ts 갱신은 EVAL-0060 산출물)
- 신규: evals/fixtures/read-contracts/penalty-status.ts · penalty-waiting.ts

## Requirements

- `penalty-status.ts`: `PENALTY_STATUS_EXPECTED: PenaltyStatusView` — 7일 주3회 closed 시나리오. viewer 민지(pending·signedUrl·rejectCount:0·isViewer:true), JJ(pending·rejectCount:1·isViewer:false), signedParticipantCount:3.
- `penalty-waiting.ts`: `PENALTY_WAITING_TABLES` — challenges 4행(cw1~cw4). `PENALTY_WAITING_EXPECTED = [{challengeId:"cw1",...}]`. NOW=2026-05-10T00:00:00Z.
  - cw1: 종료+72h(창2 open)·viewer 서약 → 포함. cw2: 종료+12h(창 전) → 제외. cw3: 종료+120h(만료) → 제외. cw4: 창2 open이나 viewer 미서약 → 제외.
- `penalty.spec.ts`에 `describe("penalty-status fixture parity")` 추가 — `penaltyStatusViewSchema.parse(PENALTY_STATUS_EXPECTED)` round-trip.
- `pnpm --filter @withkey/domain test -- penalty` PASS.

## Non-goals

- RN penalty-reads 서비스 구현 — EVAL-0066
- BFF mock integration 테스트(E2E) — 후속

## Acceptance Criteria

| 기준                                                         | 검증 방법                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| penaltyStatusViewSchema가 PENALTY_STATUS_EXPECTED round-trip | `pnpm --filter @withkey/domain test -- penalty`                    |
| fixture 파일 2종 존재 + TypeScript 타입 정합                 | `pnpm --filter @withkey/domain exec tsc --noEmit` (도달 경로 포함) |
| penalty-waiting cw1만 EXPECTED 패턴 확인                     | 코드 검토(fixture 구조)                                            |
| harness 추적성                                               | `pnpm harness:check`                                               |

## Verification Commands

```bash
pnpm --filter @withkey/domain test -- penalty
pnpm --filter @withkey/domain exec tsc --noEmit
pnpm harness:check
pnpm validate:docs
```

## Expected Output Summary

`evals/fixtures/read-contracts/penalty-status.ts`·`penalty-waiting.ts` 신규, `penalty.spec.ts`에 parity describe 추가. domain test PASS를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? `evals/fixtures/read-contracts/` 하위 penalty 파일 신규 — 기존 fixtures/ 디렉토리 확장.
2. Did this task introduce a new naming convention? 없음.
3. Did this task introduce a new dependency? 없음.
4. Did this task change verification commands? 없음.
5. Did this task reveal that the current harness instructions are outdated? 판단 필요.
6. Should any `.agents/` document be updated? yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- penalty-status fixture parity 테스트 green + typecheck PASS + `pnpm harness:check` 통과 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → 태스크 과대, split-work-packages로 분할.

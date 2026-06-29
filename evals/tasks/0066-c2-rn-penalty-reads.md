---
Task: EVAL-0066
Track: greenfield
Kind: migration
Status: todo
Depends-on: [task:EVAL-0064] [task:EVAL-0065] — BFF route(EVAL-0064)와 fixture(EVAL-0065) 완료 후 RN service 구현이 의미 있다.
Parent: docs/superpowers/plans/2026-06-29-rn-settlement-c2-penalty.md
---

# EVAL-0066: RN penalty-reads — BFF status read + RLS-direct waiting read

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0066` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10). spec: docs/superpowers/specs/2026-06-29-rn-settlement-points-redemption-design.md §C2
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-settlement-c2-penalty` (base: develop, SL0 머지 후)

## Goal

`apps/mobile/src/features/penalty/api/penalty-reads.ts`를 신설한다. `fetchPenaltyStatus(challengeId)` = BFF `GET /api/penalty-status` 호출 + `penaltyStatusViewSchema` zod parse(404 → null, 기타 에러 throw). `fetchPenaltyWaiting(viewerId, {now?})` = web `penalty-waiting.ts` 로직 미러(RLS-direct + in-memory 창2 게이트 [종료+48h,+96h]). `penalty-reads.spec.ts`가 EVAL-0065 fixture(`PENALTY_STATUS_EXPECTED`·`PENALTY_WAITING_TABLES`·`PENALTY_WAITING_EXPECTED`)를 공유해 BFF round-trip과 waiting 필터를 검증한다.

상세 구현은 `docs/superpowers/plans/2026-06-29-rn-settlement-c2-penalty.md` Task 7을 따른다.

## Source Files to Inspect

- `apps/mobile/src/services/api/bff-client.ts` — `bffGetJson`·`BffRequestError` 인터페이스
- `apps/mobile/src/services/supabase/client.ts` — `getSupabaseClient` 시그니처
- `apps/mobile/src/shared/testing/mock-supabase.ts` — `makeMockSupabase`·`MockTables` (no-op 필터 특성 확인)
- `apps/mobile/src/features/recap/api/recap-reads.ts` — RLS-direct read 선례(쿼리 패턴)
- `evals/fixtures/read-contracts/feed.ts` — fixture 구조 선례 (penalty-status·waiting은 EVAL-0065 신규)

## Target Files

- `apps/mobile/src/features/recap/api/recap-reads.ts` — 구조 선례 확인(수정 없음, 패턴 참조용)
- 신규: apps/mobile/src/features/penalty/api/penalty-reads.ts · penalty-reads.spec.ts

## Requirements

- `fetchPenaltyStatus(challengeId: string): Promise<PenaltyStatusView | null>` — `bffGetJson(/api/penalty-status?challengeId=...)` + `penaltyStatusViewSchema.parse`. BffRequestError 404 → null, 기타 → throw.
- `fetchPenaltyWaiting(viewerId, {now?}): Promise<PenaltyWaitingView[]>` — `getSupabaseClient()` 직접. groups → challenges(closed·penalty_mission) → in-memory 창2 게이트(OPEN_MS=48h·CLOSE_MS=96h) → viewer 서약 필터. web penalty-waiting.ts 미러.
- mock supabase 필터 no-op: fixture row가 이미 조건 충족 → in-memory 게이트가 변별.
- 상대경로 6단계(recap-reads.spec.ts 선례).

## Non-goals

- submit-penalty-proof·toggle-penalty-rejection mutation — Phase D–E
- penalty 화면 컴포넌트 — Phase F
- home "만회 찬스 대기" 섹션 UI 통합 — Phase F

## Acceptance Criteria

| 기준                                                                          | 검증 방법                                             |
| ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| BFF round-trip: mockBffGetJson → zod parse → PENALTY_STATUS_EXPECTED          | `pnpm --filter @withkey/mobile test -- penalty-reads` |
| 404 BffRequestError → null                                                    | `pnpm --filter @withkey/mobile test -- penalty-reads` |
| 404 외 에러 → throw                                                           | `pnpm --filter @withkey/mobile test -- penalty-reads` |
| fetchPenaltyWaiting: PENALTY_WAITING_TABLES → PENALTY_WAITING_EXPECTED(cw1만) | `pnpm --filter @withkey/mobile test -- penalty-reads` |
| TypeScript 이상 없음                                                          | `pnpm --filter @withkey/mobile exec tsc --noEmit`     |
| harness 추적성                                                                | `pnpm harness:check`                                  |

## Verification Commands

```bash
pnpm --filter @withkey/mobile test -- penalty-reads
pnpm --filter @withkey/mobile exec tsc --noEmit
pnpm --filter @withkey/mobile lint
pnpm harness:check
pnpm validate:docs
```

## Expected Output Summary

`apps/mobile/src/features/penalty/api/penalty-reads.ts`·`penalty-reads.spec.ts` 신규 생성. BFF status round-trip + waiting 필터 테스트 PASS, typecheck PASS를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? `apps/mobile/src/features/penalty/api/` 디렉토리 신규.
2. Did this task introduce a new naming convention? `penalty-reads.ts/spec.ts` — recap-reads 선례와 동일.
3. Did this task introduce a new dependency? 없음(기존 bff-client·supabase client 재사용).
4. Did this task change verification commands? `pnpm --filter @withkey/mobile test -- penalty-reads` 신규.
5. Did this task reveal that the current harness instructions are outdated? 판단 필요.
6. Should any `.agents/` document be updated? yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- BFF round-trip·waiting 필터 테스트 전 항목 green + typecheck PASS + `pnpm harness:check` 통과 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → 태스크 과대, split-work-packages로 분할.

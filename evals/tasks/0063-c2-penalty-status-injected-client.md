---
Task: EVAL-0063
Track: port
Kind: migration
Status: todo
Depends-on: [task:EVAL-0060] — domain read-contract가 완성돼야 penalty-status.ts의 타입 import 치환이 완료된다.
Parent: docs/superpowers/plans/2026-06-29-rn-settlement-c2-penalty.md
---

# EVAL-0063: fetchPenaltyStatusForViewerClient 주입 변형 추출 (web reads 리팩터)

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0063` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10). spec: docs/superpowers/specs/2026-06-29-rn-settlement-points-redemption-design.md §C2
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-settlement-c2-penalty` (base: develop, SL0 머지 후)

## Goal

`apps/web/src/lib/db/reads/penalty-status.ts`의 `fetchPenaltyStatus`를 `fetchChallengeFeedForViewerClient` 모델대로 쪼갠다 — Layer 1을 주입 client로 실행하는 `fetchPenaltyStatusForViewerClient`(신규 export)를 추출하고, 기존 `fetchPenaltyStatus`는 cookie client를 주입하는 thin wrapper로 보존한다. Layer 2 helper 3종(`adminClient` + `"use cache"`)은 변경 없이 양쪽이 공유한다. 기존 web consumer(RSC page, 테스트)의 동작이 비파괴로 유지되고, BFF route(EVAL-0064)가 주입 변형을 호출할 수 있게 된다.

상세 구현은 `docs/superpowers/plans/2026-06-29-rn-settlement-c2-penalty.md` Task 4를 따른다.

## Source Files to Inspect

- `apps/web/src/lib/db/reads/penalty-status.ts` — 현재 fetchPenaltyStatus 전체 본문(Layer 1·Layer 2 경계 확인)
- `apps/web/src/lib/db/reads/challenge-feed.ts` — fetchChallengeFeedForViewerClient 선례(주입 변형 패턴)
- `apps/web/src/lib/supabase/bearer.ts` — createBearerClient 시그니처 확인(EVAL-0064 의존)

## Target Files

- `apps/web/src/lib/db/reads/penalty-status.ts` — 기존 함수 wrapper로 유지 + `fetchPenaltyStatusForViewerClient` 신규 export

## Requirements

- `fetchPenaltyStatusForViewerClient(viewerClient: SupabaseClient, challengeId: string, viewerId: string): Promise<PenaltyStatusView | null>` export.
- `fetchPenaltyStatus`는 `fetchPenaltyStatusForViewerClient(await createClient(), ...)` 위임 wrapper로 보존.
- Layer 2 helper(`getPenaltyProofRejectCount` 등 adminClient + "use cache")는 수정 없이 공유.
- 기존 web consumer 비파괴: `pnpm --filter web exec tsc --noEmit` PASS.
- 기존 penalty-status 테스트(있으면) 비파괴: `pnpm --filter web test -- penalty-status` PASS.

## Non-goals

- BFF route 신설 — EVAL-0064
- Layer 2 helper 수정
- web RSC page 수정

## Acceptance Criteria

| 기준                                                          | 검증 방법                                  |
| ------------------------------------------------------------- | ------------------------------------------ |
| fetchPenaltyStatusForViewerClient export 존재 + 시그니처 정합 | `pnpm --filter web exec tsc --noEmit`      |
| 기존 fetchPenaltyStatus 동작 보존(wrapper 위임)               | 코드 검토 + typecheck                      |
| 기존 web 테스트 비파괴                                        | `pnpm --filter web test -- penalty-status` |
| harness 추적성                                                | `pnpm harness:check`                       |

## Verification Commands

```bash
pnpm --filter web exec tsc --noEmit
pnpm --filter web test -- penalty-status
pnpm --filter web lint
pnpm harness:check
pnpm validate:docs
```

## Expected Output Summary

`penalty-status.ts`에 `fetchPenaltyStatusForViewerClient` 추가, 기존 함수를 wrapper로 유지. typecheck PASS, 기존 테스트 비파괴를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? 없음.
2. Did this task introduce a new naming convention? `fetchXxxForViewerClient` 패턴 — 기존 feed 선례와 동일.
3. Did this task introduce a new dependency? 없음.
4. Did this task change verification commands? 없음(기존 커맨드 재사용).
5. Did this task reveal that the current harness instructions are outdated? 판단 필요.
6. Should any `.agents/` document be updated? yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- typecheck PASS + 기존 web 테스트 비파괴 + `pnpm harness:check` 통과 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → 태스크 과대, split-work-packages로 분할.

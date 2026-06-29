---
Task: EVAL-0064
Track: port
Kind: migration
Status: todo
Depends-on: [task:EVAL-0063] — fetchPenaltyStatusForViewerClient 주입 변형이 완성돼야 route가 호출할 수 있다.
Parent: docs/superpowers/plans/2026-06-29-rn-settlement-c2-penalty.md
---

# EVAL-0064: BFF GET /api/penalty-status route (Bearer · penalty 창2 상태)

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0064` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10). spec: docs/superpowers/specs/2026-06-29-rn-settlement-points-redemption-design.md §C2
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-settlement-c2-penalty` (base: develop, SL0 머지 후)

## Goal

`apps/web/src/app/api/penalty-status/route.ts`를 신설한다. feed BFF route 패턴 미러 — Bearer 인증 → `challengeId` uuid 검증 → `fetchPenaltyStatusForViewerClient` 호출 → JSON 반환. `penaltyMission`이 없거나 view가 null이면 404. route.spec.ts가 토큰 없음(401)·잘못된 uuid(400)·view 있음(200)·null(404)·펜션미션 없음(404)·throw(500) 6가지 계약을 검증한다.

상세 구현은 `docs/superpowers/plans/2026-06-29-rn-settlement-c2-penalty.md` Task 5를 따른다.

## Source Files to Inspect

- `apps/web/src/app/api/feed/route.ts` — feed BFF route 선례(bearerTokenFrom·createBearerClient 사용 패턴)
- `apps/web/src/lib/supabase/bearer.ts` — bearerTokenFrom·createBearerClient 헬퍼
- `apps/web/src/app/api/action-log/route.ts` — BFF route 테스트 선례(route.spec.ts 동일 디렉토리)
- `apps/web/src/lib/db/reads/penalty-status.ts` — fetchPenaltyStatusForViewerClient(EVAL-0063 산출물)

## Target Files

- `apps/web/src/lib/db/reads/penalty-status.ts` — fetchPenaltyStatusForViewerClient export 확인(EVAL-0063 결과물 의존)
- 신규: apps/web/src/app/api/penalty-status/route.ts · route.spec.ts

## Requirements

- `GET /api/penalty-status?challengeId=<uuid>` + `Authorization: Bearer <token>`.
- 토큰 없음 → 401. challengeId UUID 아님 → 400. view null 또는 penaltyMission null → 404. read throw → 500.
- Bearer token으로 `supabase.auth.getUser(token)` 인증(ADR-0036 §1·§2 패턴).
- 성공 응답은 `PenaltyStatusView`를 JSON으로 직렬화(별도 zod serialize 없음 — BFF 봉투 불필요, feed 선례).
- PWA 클라이언트(web)가 이 endpoint를 호출하지 않도록 Non-goals에 명시.
- `challengeSchema.shape.id`(domain)로 uuid 검증.

## Non-goals

- POST /api/penalty-proof (BFF write) — Phase D
- web RSC page에서 이 endpoint 호출 금지(가드레일: PWA는 RSC + Server Action)
- 응답 zod serialize(BFF read 봉투 불필요)

## Acceptance Criteria

| 기준                               | 검증 방법                                        |
| ---------------------------------- | ------------------------------------------------ |
| 토큰 없음 → 401                    | `pnpm --filter web test -- penalty-status/route` |
| challengeId UUID 아님 → 400        | `pnpm --filter web test -- penalty-status/route` |
| view 있음 → 200 + challengeId 반환 | `pnpm --filter web test -- penalty-status/route` |
| null → 404                         | `pnpm --filter web test -- penalty-status/route` |
| penaltyMission null → 404          | `pnpm --filter web test -- penalty-status/route` |
| read throw → 500                   | `pnpm --filter web test -- penalty-status/route` |
| harness 추적성                     | `pnpm harness:check`                             |

## Verification Commands

```bash
pnpm --filter web test -- penalty-status/route
pnpm --filter web exec tsc --noEmit
pnpm --filter web lint
pnpm harness:check
pnpm validate:docs
```

## Expected Output Summary

`apps/web/src/app/api/penalty-status/route.ts`·`route.spec.ts` 신규 생성. 계약 테스트 6종 PASS, typecheck PASS를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? `api/penalty-status/` 디렉토리 신규.
2. Did this task introduce a new naming convention? `route.spec.ts` — 기존 BFF 선례와 동일.
3. Did this task introduce a new dependency? 없음.
4. Did this task change verification commands? `pnpm --filter web test -- penalty-status/route` 신규.
5. Did this task reveal that the current harness instructions are outdated? 판단 필요.
6. Should any `.agents/` document be updated? yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- 계약 테스트 6종 green + typecheck PASS + `pnpm harness:check` 통과 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → 태스크 과대, split-work-packages로 분할.

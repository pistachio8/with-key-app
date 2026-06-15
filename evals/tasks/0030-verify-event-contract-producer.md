---
Task: EVAL-0030
Track: greenfield
Kind: migration
Status: blocked
Blocked-by: [task:EVAL-0022] [task:EVAL-0025] [spec:verify-analytics] [po:verify-analytics] — 0026 부모 WP와 동일 게이트 상속. PRD §9.1 union 1:1 spec + PO 승인 선행(가드레일 §AnalyticsEvent).
Parent: docs/eng-stories/2026-06-05-photo-verification.md, docs/superpowers/specs/2026-06-15-verify-analytics-events.md, docs/superpowers/plans/2026-06-15-eval-0026-verify-ops-analytics.md
---

# EVAL-0030: 검증 이벤트 계약 + producer — auto_verify_result·peer_reject (WP6 WP1)

> WP6 WP1 (`feat/rn-verify-ops`). **spec blocked** — 부모 EVAL-0026 게이트 상속. 구현 상세는 plan WP1 Task 1~3(SoT). 게이트 해소 후 단독 PR.

## Parent Links

- Parent PRD Feature: 자동검증·반려 AnalyticsEvent(PRD §9.1 union 1:1) — [docs/migration/01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §9.1
- Parent Test Scenario: TS SoT 없음 — AT eval 수용기준 흡수(05 §2 D10)
- Parent Job Story: `JS-verify-6` — [docs/stories/2026-06-05-p2-verification-job-stories.md](../../docs/stories/2026-06-05-p2-verification-job-stories.md)
- Parent Engineering Story: [2026-06-05-photo-verification](../../docs/eng-stories/2026-06-05-photo-verification.md) WP6
- Parent Work Package: `feat/rn-verify-ops` (WP6 — 부모: EVAL-0026)

## Goal

신규 AnalyticsEvent 2종(`auto_verify_result`·`peer_reject`)의 union/zod/fixture parity를 못 박고 두 emit 지점을 연결한다. `auto_verify_result`는 모든 판정(passed 포함)에서 emit. `peer_reject`는 토글마다 익명 emit(events.user_id=null). PRD §9.1 표 2행 추가.

## Source Files to Inspect

- `docs/superpowers/specs/2026-06-15-verify-analytics-events.md` (C1·C2·C4·C5)
- `docs/superpowers/plans/2026-06-15-eval-0026-verify-ops-analytics.md` (WP1 Task 1~3 코드 스니펫)
- `apps/web/src/lib/analytics/track.ts` · `schema.ts` · `schema-union-parity.spec.ts`
- `apps/web/src/lib/verify/judge.ts` · `judge.spec.ts` · `signals.ts`
- `apps/web/src/lib/action-log/submit-core.ts`
- `apps/web/src/app/(app)/challenge/[id]/_actions.ts` · `_actions.spec.ts`
- `docs/PRD.md` §9.1

## Target Files

- `apps/web/src/lib/analytics/track.ts` · `schema.ts` · `schema-union-parity.spec.ts`
- `apps/web/src/lib/verify/judge.ts` · `judge.spec.ts`
- `apps/web/src/lib/action-log/submit-core.ts` · `submit-core.spec.ts`
- `apps/web/src/app/(app)/challenge/[id]/_actions.ts` · `_actions.spec.ts`
- `docs/PRD.md` §9.1

## Requirements

구현 상세는 plan WP1 Task 1~3(SoT). 핵심 결정:

- `auto_verify_result`: judge.ts UPDATE 직후 emit. props = actionLogId·challengeId·status·phashDup·exifMissing·screenshot·score(null 가능)·modelVersion·enforced.
- `peer_reject`: \_actions.ts safeParse 후 emit. props = actionLogId·challengeId·rejectCount·status·action. 익명(options.userId 미전달).
- parity 3-of-3(union·zod·fixture) 동시 갱신. PRD §9.1 2행 + notification_sent type verify_anomaly 명시.
- 모든 payload: id·bool·수치·enum만 — 사진 URL·phash 문자열 금지(C5).

## Non-goals

- 운영 이상 알림·dispatch·cron · notification_sent zod verify_anomaly · loadVerifyOpsConfig — EVAL-0031.

## Acceptance Criteria

| 기준                     | 검증                                                 |
| ------------------------ | ---------------------------------------------------- |
| union ↔ zod parity (2종) | `pnpm --filter web test -- schema-union-parity` PASS |
| auto_verify_result emit  | `pnpm --filter web test -- judge` PASS               |
| peer_reject emit 익명    | `pnpm --filter web test -- _actions` PASS            |
| PRD §9.1 동기화          | `pnpm validate:docs` PASS                            |
| 본문 미로깅 (C5)         | payload grep — 사진 URL·phash 문자열 부재            |
| typecheck·lint           | `pnpm typecheck && pnpm lint` PASS                   |
| harness traceability     | `pnpm harness:check` PASS                            |

## Verification Commands

```bash
# blocked: EVAL-0026 게이트([spec:verify-analytics]·[po:verify-analytics]·EVAL-0022·EVAL-0025) 해소 선행.
pnpm harness:context EVAL-0030
pnpm typecheck && pnpm lint
pnpm --filter web test -- schema-union-parity judge submit-core _actions
pnpm validate:docs
pnpm harness:check
```

## Expected Output Summary

union/zod/fixture parity 완료, judge.ts challengeId 시그니처 + emit 위치, togglePeerRejection 익명 emit(2곳 외과적 삽입), PRD §9.1 2행 추가, C5 본문 미로깅 grep 결과를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. New folder structure? 2. New naming convention? 3. New dependency? 4. Verification commands changed? 5. Harness instructions outdated? 6. `.agents/` update needed?
   → yes 있으면 `evals/drift-reports/` 노트.

## Stop Condition

- EVAL-0026 게이트 해소 후 모든 AC green + Verification 통과 + Harness Impact 완료.
- blocked 동안: parity 테스트 초안 작성 가능. pass@3 미달 → union/emit/PRD 단위 분할.

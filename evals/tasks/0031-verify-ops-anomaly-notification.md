---
Task: EVAL-0031
Track: greenfield
Kind: migration
Status: blocked
Blocked-by: [task:EVAL-0022] [task:EVAL-0025] [spec:verify-analytics] [po:verify-analytics] — 0026 부모 WP와 동일 게이트 상속. notification_sent verify_anomaly enum 확장은 PRD §9.1 union 1:1 spec + PO 승인 선행.
Depends-on: [task:EVAL-0030] — WP1 이벤트 계약·union 표면 확정 선행(intra-feature 순서, 게이트 아님).
Parent: docs/eng-stories/2026-06-05-photo-verification.md, docs/superpowers/specs/2026-06-15-verify-analytics-events.md, docs/superpowers/plans/2026-06-15-eval-0026-verify-ops-analytics.md
---

# EVAL-0031: 운영 이상 알림 — verify_anomaly enum + config + dispatch + cron (WP6 WP2)

> WP6 WP2 (`feat/rn-verify-ops`). **spec blocked** — 부모 EVAL-0026 게이트 상속. Depends-on EVAL-0030. WP1 머지 후 별도 PR. migration 없음. 구현 상세는 plan WP2 Task 4~7(SoT).

## Parent Links

- Parent PRD Feature: `AC-owner-load-3`(failed·반려율 임계 그룹 알림) — [docs/migration/01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.B
- Parent Test Scenario: TS SoT 없음 — AT eval 수용기준 흡수(05 §2 D10)
- Parent Job Story: `JS-verify-6` — [docs/stories/2026-06-05-p2-verification-job-stories.md](../../docs/stories/2026-06-05-p2-verification-job-stories.md)
- Parent Engineering Story: [2026-06-05-photo-verification](../../docs/eng-stories/2026-06-05-photo-verification.md) WP6
- Parent Work Package: `feat/rn-verify-ops` (WP6 — 부모: EVAL-0026)

## Goal

부정탐지 오작동·그룹 갈등을 조기 감지해 그룹 오너에게 알린다(`AC-owner-load-3`). 4컴포넌트: (G1) notification_sent verify_anomaly enum 확장, (G2) loadVerifyOpsConfig 운영 임계 env 노브, (G3) dispatchVerifyAnomalyNotification dedup·shadow·옵트인, (G4) cron rate 산정 + 알림 트리거.

## Source Files to Inspect

- `docs/superpowers/specs/2026-06-15-verify-analytics-events.md` (C3)
- `docs/superpowers/plans/2026-06-15-eval-0026-verify-ops-analytics.md` (WP2 Task 4~7 코드 스니펫)
- `apps/web/src/lib/analytics/track.ts` · `schema.ts` · `schema-union-parity.spec.ts`
- `apps/web/src/lib/verify/config.ts` · `index.ts`
- `apps/web/src/lib/push/dispatch.ts` · `dispatch.spec.ts`
- `apps/web/src/app/api/cron/deadline-push/route.ts` · `route.spec.ts`
- `apps/web/.env.example`

## Target Files

- `apps/web/src/lib/analytics/track.ts` · `schema.ts` · `schema-union-parity.spec.ts`
- `apps/web/src/lib/verify/config.ts` · `index.ts`
- `apps/web/src/lib/push/dispatch.ts` · `dispatch.spec.ts`
- `apps/web/src/app/api/cron/deadline-push/route.ts` · `route.spec.ts`
- `apps/web/.env.example`

## Requirements

구현 상세는 plan WP2 Task 4~7(SoT). 핵심 결정:

- G1: notification_sent.type에 "verify_anomaly" 추가. anomalyReason?·week? optional. parity 3-of-3 동시 갱신.
- G2: loadVerifyOpsConfig — θ verifyEnvSchema 분리. 기본값 0.3/0.3/3. .env.example 주석.
- G3: dedup 키 (challengeId, week, anomalyReason). deadline 옵트인. failed_rate: enforce=true만. reject_rate: 항상.
- G4: config hoist 루프 밖. groups!inner(owner_id) + auto_verify_status logs. afterEach env 오염 방지.

## Non-goals

- auto_verify_result·peer_reject 신규 이벤트 — EVAL-0030.
- Supabase migration(dedup은 events 기존 조회). 알림 트리거 정량값 analytics 적재.

## Acceptance Criteria

| 기준                                | 검증                               |
| ----------------------------------- | ---------------------------------- |
| 임계 초과 알림 AC-owner-load-3      | deadline-push test PASS            |
| failed_rate shadow 게이트           | enforce=false → dispatch 미호출    |
| dedup (동일 key → recipientCount 0) | dispatch test PASS                 |
| deadline 옵트인 false 미발송        | dispatch test PASS                 |
| loadVerifyOpsConfig 기본값·override | config test PASS                   |
| verify_anomaly parity 3-of-3        | schema-union-parity test PASS      |
| typecheck·lint                      | `pnpm typecheck && pnpm lint` PASS |
| harness traceability                | `pnpm harness:check` PASS          |

## Verification Commands

```bash
# blocked: EVAL-0026 게이트 해소 + EVAL-0030 완료 선행.
pnpm harness:context EVAL-0031
pnpm typecheck && pnpm lint
pnpm --filter web test -- schema-union-parity config dispatch deadline-push
pnpm harness:check
```

## Expected Output Summary

verify_anomaly enum 확장 위치, loadVerifyOpsConfig θ 분리 근거, dispatchVerifyAnomalyNotification dedup 키(user_id 미포함 이유), shadow 게이트(failed_rate enforce-only vs reject_rate 항상), cron config hoist 위치를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. New folder structure? 2. New naming convention? 3. New dependency? 4. Verification commands changed? 5. Harness instructions outdated? 6. `.agents/` update needed?
   → yes 있으면 `evals/drift-reports/` 노트.

## Stop Condition

- EVAL-0026 게이트 해소 + EVAL-0030 완료 후 모든 AC green + Verification 통과 + Harness Impact 완료.
- blocked 동안: config·dispatch 테스트 초안 작성 가능. pass@3 미달 → G1/G2/G3/G4 단위 분할.

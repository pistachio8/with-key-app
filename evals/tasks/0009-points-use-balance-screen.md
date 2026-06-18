---
Task: EVAL-0009
Track: greenfield
Kind: migration
Status: blocked
Blocked-by: [task:EVAL-0005] [task:EVAL-0006] [gate:G2] — G2(법무) 통과 후 union 머지·사용자향 노출. AnalyticsEvent 계약 spec(analytics-union, accepted) + PO 승인 완료(2026-06-18). 선행 WP1·WP2.
Parent: docs/eng-stories/2026-06-05-points-settlement.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0009: 포인트 사용·잔액 화면 + 정산 AnalyticsEvent

> WP5 (`feat/rn-points-use`). **G2 blocked** — 노출·union 머지는 법무(G2) 후. 신규 이벤트 계약은 spec(analytics-union, accepted) + PO 승인 완료(`track.ts`는 spec-required). 데이터·RPC는 EVAL-0005·0006 의존.

## Parent Links

- PRD: `AC-points-use-1`~`3` · `AC-settle-trigger-4` · `AC-deposit-gauge-3` — [01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.C·§9.1
- TS: `TS-points-use-1`~`2` — [test-scenarios.md](../../docs/pm/test-scenarios.md)
- JS: `JS-settle-5` — [p1-settlement-job-stories.md](../../docs/stories/2026-06-05-p1-settlement-job-stories.md)
- Eng: [points-settlement](../../docs/eng-stories/2026-06-05-points-settlement.md) WP5
- WP: `feat/rn-points-use`

## Goal

포인트 사용·조회 경로 완성. 완료 시: 환급 포인트가 다음 보증금으로 사용, 잔액·이력 화면 존재, 현금화 미노출(closed-loop), `settlement_completed`(`trigger: manual | auto` discriminant)·`points_balance_view` 2종이 PRD §9.1 union과 1:1로 발생.

## Source Files to Inspect

- `docs/adr/0032-settlement-verification-data-model.md`
- `docs/eng-stories/2026-06-05-points-settlement.md`
- `docs/pm/acceptance-criteria.md`
- `docs/pm/test-scenarios.md`
- `docs/migration/01-rn-mvp-prd.md`
- `apps/web/src/lib/analytics/track.ts`
- `apps/web/src/app/(app)/me`
- `apps/web/src/lib/db/reads`

## Target Files

- `apps/web/src/app/(app)/me` — 포인트 잔액·이력 조회 화면
- `apps/web/src/lib/analytics/track.ts` — `settlement_completed`(`trigger` discriminant)·`points_balance_view` 이벤트(PRD §9.1 union과 1:1, spec-required)
- `apps/web/src/lib/db/reads`
- `docs/superpowers/specs/` — AnalyticsEvent union 변경 spec (선행 산출물)

## Requirements

- 포인트 closed-loop — 현금화/인출 미노출. `AC-points-use-1` (`TS-points-use-1`).
- 다음 보증금 사용 시 `deposit_hold`가 잔액 차감. (Later) 구독 할인·앱 내 보상. `AC-points-use-2` (`TS-points-use-2`).
- 잔액·이력 화면 — 원장 기반(`SUM(delta)` + 이력 행). `AC-points-use-3`.
- AnalyticsEvent 2종: `settlement_completed`(`trigger: manual | auto` discriminant, `AC-settle-trigger-4`) + `points_balance_view`(`AC-deposit-gauge-3`). **PRD §9.1과 1:1** — 임의 추가 금지, spec(analytics-union, accepted) + PO 승인 완료.
- Zod ↔ TS union parity 테스트(`track.ts` 가드레일).

## Non-goals

- 정산 RPC·트리거 구현 — EVAL-0006·0008 (본 task는 사용·조회·이벤트).
- 구독 할인 결제 연동 — POC 범위 밖.
- **활성 노출 + union 머지** — G2(법무) 통과 후. (spec·PO 승인은 완료.)

## Acceptance Criteria

| 기준                                                       | 검증 방법                                              |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| 현금화 불가 (`AC-points-use-1`)                            | `TS-points-use-1`: 인출 경로 부재                      |
| 다음 보증금 사용 (`AC-points-use-2`)                       | `TS-points-use-2`: `deposit_hold`가 환급 잔액에서 차감 |
| 잔액·이력 화면 (`AC-points-use-3`)                         | 수동 확인 — 잔액=Σdelta + 이력 행                      |
| 이벤트 parity (`AC-settle-trigger-4`·`AC-deposit-gauge-3`) | Zod ↔ TS union parity 테스트, PRD §9.1 1:1             |
| harness traceability                                       | `pnpm harness:check` 통과                              |

## Verification Commands

```bash
pnpm harness:context EVAL-0009
pnpm typecheck && pnpm lint
pnpm test -- analytics          # AnalyticsEvent Zod ↔ TS union parity
pnpm harness:check
# 모바일 viewport 수동 확인 (잔액·이력 화면) — G2 활성 후
```

## Expected Output Summary

포인트 사용 흐름(다음 보증금), 잔액·이력 화면 위치, AnalyticsEvent 2종(`settlement_completed`·`points_balance_view`) union 정합, 현금화 차단, G2 전 보류 범위를 한국어로 요약한다.

## Harness Impact Questions

1–5. No — 폴더/네이밍/의존성/커맨드/harness 기존 유지. 6. `.agents/` 갱신? No — `track.ts` 변경은 spec-required(별도 spec 산출).

## Stop Condition

- G2(법무) 통과 후 AC green + 화면 수동 확인 + `pnpm harness:check` 통과. (spec·PO 승인은 완료.)
- blocked 동안: 화면·parity 테스트 작성 가능(spec 계약 확정), union 머지·노출은 G2 후 보류.
- pass@3 실패 → 포인트 사용 / 잔액 화면 / 이벤트로 split(컨텍스트 1회 점검 후).

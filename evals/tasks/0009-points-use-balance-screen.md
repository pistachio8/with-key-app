---
Task: EVAL-0009
Track: greenfield
Kind: migration
Status: blocked
Blocked-by: G2(법무) 통과 + AnalyticsEvent union(PRD §9.1 1:1) spec 선행·PO 승인. 선행 WP1·WP2(EVAL-0005·0006).
Parent: docs/eng-stories/2026-06-05-points-settlement.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0009: 포인트 사용·잔액 화면 + 정산 AnalyticsEvent

> Work Package WP5 (`feat/rn-points-use`). **G2 + 이벤트 spec blocked** — 사용자향 노출은 법무 게이트 후, 신규 이벤트는 PRD §9.1 union 1:1 spec + PO 승인 선행(`track.ts`는 spec-required 경로). 데이터·RPC는 EVAL-0005·0006 산출물에 의존.

## Parent Links

- Parent PRD Feature: `AC-points-use-1`(현금화 불가 closed-loop) · `AC-points-use-2`(다음 보증금·구독 할인) · `AC-points-use-3`(잔액·이력 화면) · `AC-settle-trigger-4`(`settlement_triggered`/`settlement_auto` 이벤트) · `AC-deposit-gauge-3`(`points_balance_view`) — [docs/migration/01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.C·§9.1
- Parent Test Scenario: `TS-points-use-1`(현금화 불가) · `TS-points-use-2`(다음 보증금 사용) — [docs/pm/test-scenarios.md](../../docs/pm/test-scenarios.md)
- Parent Job Story: `JS-settle-5`(돌려받은 포인트를 다음에 쓴다) — [docs/pm/job-stories.md](../../docs/pm/job-stories.md)
- Parent Engineering Story: [2026-06-05-points-settlement](../../docs/eng-stories/2026-06-05-points-settlement.md) WP5
- Parent Work Package: `feat/rn-points-use` (WP5)

## Goal

번 포인트를 쓰고 보는 경로를 닫는다. 이 task가 끝나면 환급 포인트가 다음 챌린지 보증금으로 사용되고(`deposit_hold`가 환급 잔액에서 차감), 잔액·이력 조회 화면이 존재하며, 현금화 경로는 노출되지 않고(closed-loop), 정산·조회 AnalyticsEvent(`settlement_triggered`·`settlement_auto`·`points_balance_view`)가 PRD §9.1 union과 1:1로 발생한다.

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
- `apps/web/src/lib/analytics/track.ts` — `settlement_triggered`·`settlement_auto`·`points_balance_view` 이벤트(PRD §9.1 union과 1:1, spec-required)
- `apps/web/src/lib/db/reads`
- `docs/superpowers/specs/` — AnalyticsEvent union 변경 spec (선행 산출물)

## Requirements

- 포인트는 closed-loop 적립 — 현금화/인출 경로 노출 안 됨. `AC-points-use-1` (`TS-points-use-1`).
- 용도: 다음 챌린지 보증금 사용 시 새 `deposit_hold`가 환급 잔액에서 차감. (Later) 구독 할인·앱 내 보상. `AC-points-use-2` (`TS-points-use-2`).
- 잔액·이력 조회 화면 — 원장 기반(`SUM(delta)` + 이력 행). `AC-points-use-3`.
- AnalyticsEvent: `settlement_triggered`·`settlement_auto`(`AC-settle-trigger-4`) + `points_balance_view`(`AC-deposit-gauge-3`)를 추가. **PRD §9.1 이벤트 표와 1:1** — 임의 추가 금지, spec + PO 승인 선행.
- Zod union ↔ TS union parity 테스트(`track.ts` 가드레일).

## Non-goals

- 정산 RPC·트리거 구현 — WP2·WP4 (본 task는 사용·조회·이벤트).
- 구독 할인 결제 연동 — POC 범위 밖(Later).
- **사용자향 활성 + 이벤트 union 머지** — G2 + spec/PO 승인 후.

## Acceptance Criteria

| 기준                                                       | 검증 방법                                                 |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| 현금화 불가 (`AC-points-use-1`)                            | `TS-points-use-1`: 인출 경로 부재                         |
| 다음 보증금 사용 (`AC-points-use-2`)                       | `TS-points-use-2`: 새 `deposit_hold`가 환급 잔액에서 차감 |
| 잔액·이력 화면 (`AC-points-use-3`)                         | 화면 수동 확인 — 잔액=Σdelta + 이력 행 표시               |
| 이벤트 parity (`AC-settle-trigger-4`·`AC-deposit-gauge-3`) | Zod schema ↔ TS union parity 테스트, PRD §9.1 표와 1:1    |
| harness traceability                                       | `pnpm harness:check` 통과                                 |

## Verification Commands

```bash
pnpm harness:context EVAL-0009
pnpm typecheck && pnpm lint
pnpm test -- analytics          # AnalyticsEvent Zod ↔ TS union parity
pnpm harness:check
# 모바일 viewport 수동 확인 (잔액·이력 화면) — G2 활성 후
```

## Expected Output Summary

포인트 사용 흐름(다음 보증금), 잔액·이력 화면 위치, 신규 AnalyticsEvent 3종과 PRD §9.1 union 정합, 현금화 차단 확인, G2·spec 전 보류 범위를 한국어로 요약한다.

## Harness Impact Questions

1. New folder structure? No.
2. New naming convention? No.
3. New dependency? No.
4. Verification commands changed? No.
5. Harness instructions outdated? No.
6. `.agents/` 문서 갱신? No — 단 `track.ts` 변경은 spec-required(별도 spec 산출).

## Stop Condition

- G2 + 이벤트 spec/PO 승인 해제 후 Acceptance Criteria green + 화면 수동 확인 + `pnpm harness:check` 통과.
- blocked 동안: 화면·parity 테스트·spec 초안까지 진행 가능, union 머지·노출만 보류.
- pass@3 안에 green 못 만들면 → 포인트 사용 / 잔액 화면 / 이벤트 로 split (프롬프트·컨텍스트 1회 점검 후).

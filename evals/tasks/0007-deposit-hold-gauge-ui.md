---
Task: EVAL-0007
Track: greenfield
Kind: migration
Status: blocked
Blocked-by: G2(ⓑ적립 포인트 법무 검토) 통과 — 사용자향 보증금 hold/게이지 노출. 선행 WP1·WP2(EVAL-0005·0006) 구현.
Parent: docs/eng-stories/2026-06-05-points-settlement.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0007: 보증금 hold·차감 예정액 게이지 UI/read

> WP3 (`feat/rn-deposit-hold-gauge`). **G2 blocked** — hold/게이지 노출은 법무 게이트 후. 구조·코드는 가능, 활성 노출 보류. 데이터·RPC는 EVAL-0005·0006 의존.

## Parent Links

- PRD: `AC-deposit-hold-1`~`4` · `AC-deposit-gauge-1`~`3` — [01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.C
- TS: `TS-deposit-hold-1`~`4` · `TS-deposit-gauge-1` — [test-scenarios.md](../../docs/pm/test-scenarios.md)
- JS: `JS-settle-1` · `JS-settle-2` — [p1-settlement-job-stories.md](../../docs/stories/2026-06-05-p1-settlement-job-stories.md)
- Eng: [points-settlement](../../docs/eng-stories/2026-06-05-points-settlement.md) WP3
- WP: `feat/rn-deposit-hold-gauge`

## Goal

서약·진행 중 화면에 실데이터 보증금 노출. 완료 시: 서약 시 `hold_deposit` 호출 → 잔액 부족 차단(부족액 고지), 신규 유저는 `bundle_grant`로 첫 서약 가능, 그룹 이월 풀 존재 시 참가자 N명 균등 차감, 진행 중 화면에 차감 예정액 게이지 + "실제 이동" 고지.

## Source Files to Inspect

- `docs/adr/0032-settlement-verification-data-model.md`
- `docs/eng-stories/2026-06-05-points-settlement.md`
- `docs/pm/acceptance-criteria.md`
- `docs/pm/test-scenarios.md`
- `apps/web/src/app/(app)/pledge`
- `apps/web/src/app/(app)/challenge`
- `apps/web/src/lib/db/reads`
- `docs/superpowers/specs/2026-06-02-weekly-penalty-accrual.md`

## Target Files

- `apps/web/src/app/(app)/pledge` — 서약 시 hold 호출·잔액부족 차단·그랜트·공동풀 균등 분배 표시
- `apps/web/src/app/(app)/challenge` — 진행 중 차감 예정액 게이지 + "실제 이동" 고지
- `apps/web/src/lib/db/reads`

## Requirements

- 서약 hold = 최대 누적 벌금(Σ전체주 × penaltyAmount), 적립/번들 잔액 차감(현금 아님) — `AC-deposit-hold-1·2`.
- 잔액 부족 시 차단 + 부족액 고지. 0P 신규 유저는 `bundle_grant`로 첫 서약 가능 — `AC-deposit-hold-4` (`TS-deposit-hold-2·3`).
- 이월 풀 존재 시 N명 균등 차감(각 hold = 1인 최대 벌금 − 풀/N) — `AC-deposit-hold-3` (`TS-deposit-hold-4`).
- 게이지: 차감 예정액(= `confirmedPenalty` 누적) + "실제 이동" 고지 — `AC-deposit-gauge-1·2`.
- 잔액 조회 이벤트(`points_balance_view`) — `AC-deposit-gauge-3` (union은 WP5 spec 의존).

## Non-goals

- 정산 트리거·cron — EVAL-0008.
- 정산 RPC 구현 — EVAL-0006 (본 task는 호출만).
- AnalyticsEvent union 정의 — EVAL-0009.
- **사용자향 활성 노출** — G2 통과 후.

## Acceptance Criteria

| 기준                                          | 검증 방법                                                             |
| --------------------------------------------- | --------------------------------------------------------------------- |
| hold = 최대 누적 벌금 (`AC-deposit-hold-1·2`) | `TS-deposit-hold-1`: 5000P·벌금3000 → delta −3000, 가용 2000P         |
| 잔액 부족 차단 (`AC-deposit-hold-4`)          | `TS-deposit-hold-2`: 1000P·필요3000 → 차단·원장 0행                   |
| 신규 그랜트 (`AC-deposit-hold-4`)             | `TS-deposit-hold-3`: 0P → `+1000 bundle_grant` → `−1000 deposit_hold` |
| 공동풀 균등 (`AC-deposit-hold-3`)             | `TS-deposit-hold-4`: 풀2000·4명·벌금3000 → 각 hold 2500               |
| 게이지 정합 (`AC-deposit-gauge-1·2`)          | `TS-deposit-gauge-1`: 차감예정액=confirmedPenalty, 고지 노출          |
| harness traceability                          | `pnpm harness:check` 통과                                             |

## Verification Commands

```bash
pnpm harness:context EVAL-0007
pnpm typecheck && pnpm lint
pnpm test -- deposit
pnpm harness:check
# 모바일 viewport 수동 확인 (서약/게이지) — G2 활성 후
```

## Expected Output Summary

서약 hold 흐름(차단·그랜트·공동풀), 게이지 위치, `points_balance_view` 트리거 지점, G2 전 보류 범위를 한국어로 요약한다.

## Harness Impact Questions

1–6. No — 폴더/네이밍/의존성/커맨드/harness/`.agents/` 모두 기존 유지.

## Stop Condition

- G2 해제 후 AC green + 모바일 수동 확인 + `pnpm harness:check` 통과.
- blocked 동안: 구조·테스트 작성 가능, 활성 노출만 보류.
- pass@3 실패 → 서약 hold / 게이지 read로 split(컨텍스트 1회 점검 후).

---
Task: EVAL-0006
Track: greenfield
Kind: migration
Status: todo
Parent: docs/eng-stories/2026-06-05-points-settlement.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0006: 정산 RPC + 잔액 read — SECURITY DEFINER 5종 + 잔액=Σdelta 조회

> Work Package WP2 (`feat/rn-settlement-rpc`). 게이트 무관 — 결정론 불변식(idempotency·Σdelta)은 즉시 활성. **선행: EVAL-0005 데이터 레이어 migration이 있어야 RPC가 참조 가능**(빌드 순서 WP1→WP2, 게이트 차단 아님).

## Parent Links

- Parent PRD Feature: `AC-settle-trigger-3`(이중정산 idempotency) · `AC-deposit-hold-5`(잔액=Σdelta) · `AC-settle-4`(미달분 주 단위 누적) — [docs/migration/01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.C
- Parent Test Scenario: `TS-settle-trigger-2`(이중 정산 no-op) · `TS-settle-1`(release+pool) · `TS-settle-2`(주 단위 누적) — [docs/pm/test-scenarios.md](../../docs/pm/test-scenarios.md)
- Parent Job Story: `JS-settle-3`(끝나면 돌려받고 미달분은 다음 밑천) — [docs/pm/job-stories.md](../../docs/pm/job-stories.md)
- Parent Engineering Story: [2026-06-05-points-settlement](../../docs/eng-stories/2026-06-05-points-settlement.md) WP2
- Parent Work Package: `feat/rn-settlement-rpc` (WP2)

## Goal

정산·보증금의 모든 금전성 write를 `SECURITY DEFINER` RPC 한 경로로 닫는다(ADR-0032 Decision). 이 task가 끝나면 `grant_bundle_points`·`hold_deposit`·`deposit_release`·`settle_challenge`(idempotent)·`distribute_pool` RPC가 존재하고, 잔액=Σdelta 조회 read 함수가 있으며, 결정론 불변식(이중 정산 no-op, 잔액 정합)이 단위 테스트로 green이다. RN은 Server Action을 못 쓰므로(migration §9) 권한·트랜잭션·정합은 DB 안 RPC에서 닫힌다.

## Source Files to Inspect

- `docs/adr/0032-settlement-verification-data-model.md`
- `docs/eng-stories/2026-06-05-points-settlement.md`
- `docs/pm/acceptance-criteria.md`
- `docs/pm/test-scenarios.md`
- `supabase/migrations/0021_create_challenge_rpc.sql`
- `supabase/migrations/0002_rls.sql`
- `docs/superpowers/specs/2026-06-02-weekly-penalty-accrual.md`
- `docs/adr/0030-early-close-settlement-cutoff.md`
- `src/lib/db/reads`

## Target Files

- `supabase/migrations/` — 신규 정산 RPC migration(`grant_bundle_points`·`hold_deposit`·`deposit_release`·`settle_challenge`·`distribute_pool`)
- `src/lib/db/reads/` — 잔액=Σdelta 조회 함수 (user·group 스코프)
- `docs/BE_SCHEMA.md`

## Requirements

- 5종 RPC 모두 `SECURITY DEFINER`. 권한 체크(그룹장/멤버) RPC 내부에서, 클라 토큰이 원장에 직접 INSERT 불가.
- `settle_challenge`: `insert into settlements ... on conflict (challenge_id) do nothing` 후 영향 행 0이면 **no-op(멱등)** — 클릭+cron 동시 트리거에도 정산 1회.
- 미달분 산정 = `confirmedPenalty`(주 단위 누적, spec weekly-penalty-accrual). binary 아님. 조기 종료는 `challenges.closed_at` cutoff(ADR-0030)와 정합.
- `distribute_pool`: 미달분을 그룹 공동 주머니(`settlements.pool_points`)로 이월. **개인 재분배 0행**(도박 위험 회피, `AC-settle-6`).
- 모든 금전 이동은 `point_ledger` append (`reason` 적절히), `settlements`에 분배 스냅샷 저장.
- 잔액 read: `SUM(delta)` 집계. balance 컬럼 참조 금지.
- 결정론 불변식 단위 테스트: (a) 재트리거 시 추가 원장 0행·settlements 1행 유지 (`TS-settle-trigger-2`), (b) release+penalty 합 = hold 합 (정합).

## Non-goals

- 사용자향 트리거 UI/cron 배선 — WP4/EVAL-0008.
- 보증금 hold UI·게이지 — WP3/EVAL-0007.
- AnalyticsEvent(`settlement_triggered` 등) — WP5/EVAL-0009 (PRD §9.1 union spec 선행).
- production apply — G2 후.

## Acceptance Criteria

| 기준                                   | 검증 방법                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| 이중정산 no-op (`AC-settle-trigger-3`) | 단위 테스트: 재트리거 → settlements 1행·추가 원장 0행 (`TS-settle-trigger-2`)     |
| 정합 (잔액=Σdelta)                     | 단위 테스트: hold/release/penalty 합산이 원장 Σdelta와 일치 (`TS-deposit-hold-5`) |
| 미달분 주 단위 (`AC-settle-4`)         | `confirmedPenalty` 산정 = Σ(미달 주 × 주 벌금), binary 아님 (`TS-settle-2`)       |
| 재분배 0행 (`AC-settle-6`)             | 정산 결과에 개인↔개인 이동 행 없음 (`TS-settle-1`)                                |
| write는 RPC만                          | 클라 토큰 직접 INSERT가 `42501` (CI 역할 테스트)                                  |
| harness traceability                   | `pnpm harness:check` 통과                                                         |

## Verification Commands

```bash
pnpm harness:context EVAL-0006
pnpm typecheck && pnpm lint
pnpm test -- settlement          # idempotency·Σdelta 정합 불변식 (로컬, DB 불필요)
pnpm harness:check
# CI 전용: migration apply 후 RPC 권한·역할 테스트
```

## Expected Output Summary

5종 RPC의 시그니처·트랜잭션 경계, idempotency 보장 방식(`on conflict do nothing`), 미달분 누적 산정과 cutoff 정합, 잔액 read 위치, 불변식 테스트 결과, G2 전 보류 항목을 한국어로 요약한다.

## Harness Impact Questions

1. New folder structure? No.
2. New naming convention? No — RPC는 기존 `*_rpc` 패턴(0021) 재사용.
3. New dependency? No.
4. Verification commands changed? No.
5. Harness instructions outdated? No.
6. `.agents/` 문서 갱신? No.

## Stop Condition

- 결정론 불변식 테스트 green + `pnpm harness:check` 통과.
- pass@3 안에 green 못 만들면 → RPC 단위(hold / settle / distribute)로 split (프롬프트·컨텍스트 1회 점검 후).

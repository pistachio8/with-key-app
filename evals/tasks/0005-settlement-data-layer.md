---
Task: EVAL-0005
Track: greenfield
Kind: migration
Status: todo
Parent: docs/eng-stories/2026-06-05-points-settlement.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0005: 정산 데이터 레이어 — point_ledger · settlements · deposit_points + RLS + 가드 트리거

> WP1 (`feat/rn-settlement-data`). 설계·코드는 즉시 진행, **production apply만 G2(법무) 후**(ADR-0032). `잔액=Σdelta` 불변식은 게이트 무관 즉시 활성.

## Parent Links

- PRD: `AC-deposit-hold-5` · `AC-settle-7` — [01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.C
- TS: `TS-deposit-hold-5` · `TS-settle-4` — [test-scenarios.md](../../docs/pm/test-scenarios.md)
- JS: `JS-settle-1` — [p1-settlement-job-stories.md](../../docs/stories/2026-06-05-p1-settlement-job-stories.md)
- Eng: [points-settlement](../../docs/eng-stories/2026-06-05-points-settlement.md) WP1
- WP: `feat/rn-settlement-data`

## Goal

POC 표시만이던 벌금을 실데이터 정산으로 전환하는 저장 구조 확정. 완료 시: `point_ledger`(append-only) · `settlements`(PK=challenge_id) · `deposit_points`(캐시)가 ADR-0032대로 migration에 존재하고, RLS·가드 트리거 적용, `잔액=Σdelta` 불변식이 테스트로 검증된다.

## Source Files to Inspect

- `docs/adr/0032-settlement-verification-data-model.md`
- `docs/eng-stories/2026-06-05-points-settlement.md`
- `docs/pm/acceptance-criteria.md` · `docs/pm/test-scenarios.md`
- `docs/BE_SCHEMA.md` · `docs/BE_SCHEMA_RLS.md`
- `supabase/migrations/0002_rls.sql` · `0021_create_challenge_rpc.sql`
- `docs/superpowers/specs/2026-06-02-weekly-penalty-accrual.md`

## Target Files

- `supabase/migrations/` — `0042_point_ledger.sql` · `0043_settlements.sql` · `deposit_points` alter
- `docs/BE_SCHEMA.md` · `docs/BE_SCHEMA_RLS.md`

## Requirements

- `point_ledger`: `id · user_id · group_id · challenge_id? · delta(int) · reason(enum) · ref_id · created_at`. balance 없음(잔액=`SUM(delta)`).
- `reason` enum: `bundle_grant · deposit_hold · deposit_release · penalty · distribution · refund`.
- `settlements`: `challenge_id` PK(이중정산 차단). `settled_at · settled_by · pool_points · distribution(jsonb)`.
- `challenge_participants.deposit_points`(int) — 게이지 캐시(SoT 원장, 생략 가능).
- RLS: SELECT = 본인·동일 그룹. INSERT/UPDATE/DELETE 없음(write=SECURITY DEFINER RPC).
- 가드 트리거: `role <> 'service_role'` write → `42501`.
- `잔액=Σdelta` 테스트: N행 이력 합 == 잔액. 게이트 무관 즉시 활성.

## Non-goals

- RPC 구현(`hold_deposit`·`settle_challenge`) — EVAL-0006.
- 사용자향 게이지 노출 — EVAL-0007 (G2 blocked).
- `action_logs` 자동검증 컬럼 — P2 범위.
- production apply — G2 통과 후.
- down 스크립트 (POC forward-only).

## Acceptance Criteria

| 기준                                     | 검증 방법                                                 |
| ---------------------------------------- | --------------------------------------------------------- |
| ledger append-only                       | UPDATE/DELETE 없음 + balance 부재 DDL 대조                |
| 잔액=Σdelta 불변식 (`AC-deposit-hold-5`) | 이력 합 == 잔액 테스트 (`TS-deposit-hold-5`)              |
| 이중정산 스키마 차단                     | `settlements.challenge_id` PK DDL (`AC-settle-trigger-3`) |
| RLS self/그룹 read                       | anon/authenticated SELECT + write deny (CI 후)            |
| 가드 트리거 write-deny                   | service_role 외 INSERT → `42501`                          |
| harness traceability                     | `pnpm harness:check` 통과                                 |

## Verification Commands

```bash
pnpm harness:context EVAL-0005
pnpm typecheck && pnpm lint
pnpm test -- point-ledger        # 잔액=Σdelta 구조 불변식 (로컬, DB 불필요)
pnpm harness:check
# CI 전용(로컬 Supabase 스택 없음): migration apply + anon/authenticated RLS 역할 테스트
```

## Expected Output Summary

migration 위치, RLS·가드 트리거 범위, `잔액=Σdelta` 테스트 결과, BE_SCHEMA 갱신, G2 전 보류를 한국어로 요약한다.

## Harness Impact Questions

1–6. No — 폴더/네이밍(`000X_<snake_case>.sql`)/의존성/커맨드/harness/`.agents/` 모두 기존 유지.

## Stop Condition

- 모든 AC checkable + 로컬(typecheck·lint·test·harness:check) green.
- `pnpm harness:check` EVAL-0005 통과.
- pass@3 실패 → ledger / settlements / column 단위 split(컨텍스트 1회 점검 후).

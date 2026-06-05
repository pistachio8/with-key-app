---
Task: EVAL-0005
Track: greenfield
Kind: migration
Status: todo
Parent: docs/eng-stories/2026-06-05-points-settlement.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0005: 정산 데이터 레이어 — point_ledger · settlements · deposit_points + RLS + 가드 트리거

> Work Package WP1 (`feat/rn-settlement-data`). 게이트 무관 — 설계·로컬 검증·코드 작성은 즉시 진행, **production migration apply만 G2(법무) 통과 후**(ADR-0032 §게이트). 결정론 불변식 `잔액=Σdelta`는 게이트와 무관하게 즉시 활성(05 §3).

## Parent Links

- Parent PRD Feature: `AC-deposit-hold-5`(잔액=Σdelta 불변식) · `AC-settle-7`(원장 append + 스냅샷) — [docs/migration/01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.C
- Parent Test Scenario: `TS-deposit-hold-5`(잔액=Σdelta) · `TS-settle-4`(스냅샷 불변) — [docs/pm/test-scenarios.md](../../docs/pm/test-scenarios.md)
- Parent Job Story: `JS-settle-1`(서약 시 진짜 잃을 포인트가 잠긴다) — [docs/stories/2026-06-05-p1-settlement-job-stories.md](../../docs/stories/2026-06-05-p1-settlement-job-stories.md)
- Parent Engineering Story: [2026-06-05-points-settlement](../../docs/eng-stories/2026-06-05-points-settlement.md) WP1
- Parent Work Package: `feat/rn-settlement-data` (WP1)

## Goal

POC에서 "표시만"이던 벌금을 실데이터 정산으로 옮기기 위한 금전성 저장 구조를 고정한다. 이 task가 끝나면 append-only 포인트 원장(`point_ledger`, 잔액=Σdelta), 불변 정산 스냅샷(`settlements`, PK=challenge_id), 게이지 read용 denormalized 캐시 컬럼(`challenge_participants.deposit_points`)이 ADR-0032대로 migration 파일로 존재하고, RLS(self/그룹 read · write는 RPC만)와 write-deny 가드 트리거가 적용되며, `잔액=Σdelta` 구조 불변식이 단위 테스트로 검증된다.

## Source Files to Inspect

- `docs/adr/0032-settlement-verification-data-model.md`
- `docs/eng-stories/2026-06-05-points-settlement.md`
- `docs/pm/acceptance-criteria.md`
- `docs/pm/test-scenarios.md`
- `docs/BE_SCHEMA.md`
- `docs/BE_SCHEMA_RLS.md`
- `supabase/migrations/0002_rls.sql`
- `supabase/migrations/0021_create_challenge_rpc.sql`
- `docs/superpowers/specs/2026-06-02-weekly-penalty-accrual.md`

## Target Files

- `supabase/migrations/` — 신규 `0042_point_ledger.sql` · `0043_settlements.sql` · `challenge_participants.deposit_points` alter (번호는 맨 뒤 append, 재정렬 금지)
- `docs/BE_SCHEMA.md`
- `docs/BE_SCHEMA_RLS.md`

## Requirements

- `point_ledger`: `id · user_id · group_id · challenge_id(nullable) · delta(signed integer) · reason(check enum) · ref_id · created_at`. balance 컬럼 두지 않음 — 잔액은 `SUM(delta)`로만 도출.
- `reason` CHECK: `bundle_grant · deposit_hold · deposit_release · penalty · distribution · refund`.
- `settlements`: `challenge_id`를 **PK로 둬서 이중 정산을 스키마 레벨 차단**. `settled_at · settled_by(check owner|auto) · pool_points · distribution(jsonb)`.
- `challenge_participants.deposit_points`(integer) 추가는 게이지 read 편의 denormalized 캐시 — SoT는 원장. (원장 파생으로 충분하면 생략 가능, BE 판단.)
- RLS: 두 테이블 SELECT = 본인(`user_id = auth.uid()`) 또는 동일 그룹 멤버(`is_group_member(group_id)`). INSERT/UPDATE/DELETE 정책 없음 → 클라 deny, write는 SECURITY DEFINER RPC만.
- 가드 트리거: `role <> 'service_role'`의 원장/스냅샷 직접 write를 `42501`로 거부 (0002 가드 트리거 패턴 확장, 새 메커니즘 만들지 않음).
- 구조 불변식 `잔액=Σdelta` 단위 테스트: 임의 N행 이력 → 표시 잔액 == `SUM(delta)` (balance drift 0). 게이트 무관 즉시 활성.

## Non-goals

- 정산 RPC 시그니처·구현(`hold_deposit`·`settle_challenge` 등) — WP2/EVAL-0006.
- 사용자향 보증금 hold/게이지 노출 — WP3/EVAL-0007 (G2 blocked).
- `action_logs` 자동검증 컬럼(`auto_verify_*`·`photo_phash`) — P2 자동검증, 본 WP 범위 밖.
- **production migration apply** — G2(ⓑ적립 포인트 법무 검토) 통과 후. 본 task는 설계·로컬 검증·코드까지.
- down 스크립트 (POC forward-only).

## Acceptance Criteria

| 기준                                     | 검증 방법                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| ledger append-only                       | `point_ledger`에 UPDATE/DELETE 정책 없음 + balance 컬럼 부재를 migration DDL 대조 |
| 잔액=Σdelta 불변식 (`AC-deposit-hold-5`) | 단위 테스트: 임의 이력 합 == 표시 잔액 (`TS-deposit-hold-5`)                      |
| 이중정산 스키마 차단                     | `settlements.challenge_id` PK 존재를 DDL 대조 (`AC-settle-trigger-3` 전제)        |
| RLS self/그룹 read                       | anon/authenticated 역할별 SELECT 가시성 + 클라 write deny (CI migration apply 후) |
| 가드 트리거 write-deny                   | service_role 외 직접 INSERT가 `42501` (CI 역할 테스트)                            |
| harness traceability                     | `pnpm harness:check`가 frontmatter·Parent·Source·Target·AC 인용을 검증·통과       |

## Verification Commands

```bash
pnpm harness:context EVAL-0005
pnpm typecheck && pnpm lint
pnpm test -- point-ledger        # 잔액=Σdelta 구조 불변식 (로컬, DB 불필요)
pnpm harness:check
# CI 전용(로컬 Supabase 스택 없음): migration apply + anon/authenticated RLS 역할 테스트
```

## Expected Output Summary

`point_ledger`·`settlements`·`deposit_points` migration이 ADR-0032대로 추가된 위치, RLS·가드 트리거 적용 범위, `잔액=Σdelta` 불변식 테스트 결과, BE_SCHEMA 갱신 지점, G2 전까지 보류되는 항목(production apply)을 한국어로 요약한다.

## Harness Impact Questions

1. New folder structure? No — `supabase/migrations/`·`docs/` 기존 위치.
2. New naming convention? No — `000X_<snake_case>.sql` 규약 유지.
3. New dependency? No.
4. Verification commands changed? No — 기존 `harness:*`·`pnpm test` 사용. (CI migration apply는 기존 `scripts/ci/apply-migrations.sh`.)
5. Harness instructions outdated? No.
6. `.agents/` 문서 갱신? No — 본 task 정의는 기존 템플릿 계약을 따른다.

## Stop Condition

- 모든 Acceptance Criteria가 checkable + 로컬 가능 범위(typecheck·lint·불변식 test·harness:check) green.
- `pnpm harness:check`가 EVAL-0005에 대해 통과.
- pass@3 안에 green 못 만들면 → migration 단위(ledger / settlements / column)로 split-work-packages 분할 (프롬프트·컨텍스트 문제 1회 점검 후, 05 §9.4).

---
Task: EVAL-0045
Track: greenfield
Kind: migration
Status: in_progress
Blocked-by: [task:EVAL-0044] — `penalty_debts` 테이블과 EVAL-0042 deferred 분기가 선행 필요. (RESOLVED 2026-06-24: EVAL-0044 done — `penalty_debts` 테이블·RLS 가 `0055_penalty_redemption.sql` 에 존재, deferred 분기는 EVAL-0042 done. flip 승인: 사용자 orchestrate D6)
Parent: docs/superpowers/specs/2026-06-23-feed-type-penalty-redesign-design.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0045: Redemption 정산 연동 + 2X carry-over 수금 구현

> spec §C5 및 Rollout ④ 구현. `point_ledger.reason` CHECK 확장(`penalty_debt_carryover`), `settle_challenge` carry-over 포함 귀속, penalty_debts accepted/rejected/expired 처리 RPC, 멱등 수금(1회 차감) 로직이 이 task 의 범위다. 핵심 출시(①~④) 마지막 단계.

## Parent Links

- Parent PRD Feature: spec §C5 — [2026-06-23-feed-type-penalty-redesign-design.md](../../docs/superpowers/specs/2026-06-23-feed-type-penalty-redesign-design.md)
- Parent Test Scenario: SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: SoT 없음 — AT eval 흡수
- Parent Engineering Story: SoT 없음 — AT eval 흡수
- Parent Work Package: `feat/redemption-settlement-carryover`

## Goal

`0054` migration으로 `point_ledger.reason` CHECK에 `'penalty_debt_carryover'`가 추가되고, `finalize_penalty_proof` RPC(accepted→면제·rejected/expired→2X debt)와 carry-over 수금 RPC(멱등·service_role)가 구현된다. deferred→debt(open)→carryover 전체 흐름이 integration으로 검증된다.

## Source Files to Inspect

- **화면 시안(참고)** — 정산 영수증·2배 이월 표기(carry-over 카피·금액 기준): 허브 `docs/mockups/2026-06-24-feed-type-penalty-screens.html` 변이 D·B · 결과 `docs/mockups/2026-06-24-feed-type-penalty/penalty-result.html`(r=rejected) (spec §화면 시안)
- `supabase/migrations/0044_settlement_rpcs.sql` — `settle_challenge`(EVAL-0042에서 INSERT-once로 재설계됨), `grant_bundle_points` 패턴(service_role 수금 참조)
- `supabase/migrations/0050_settlement_penalty_exclude_peer_rejected.sql` — `point_ledger.reason` CHECK 제약 현행 값 목록 참조
- `packages/domain/src/settlement.ts` — `SettlementReason`(L21, 손수 union), `computeSettlement`(EVAL-0042 deferred 분기 결과물)
- `docs/adr/0032-settlement-verification-data-model.md` — 불변성·append-only 원칙 SoT
- `apps/web/src/lib/db/reads/current-challenges.ts` — `0029_one_active_challenge_per_group` 제약 확인(non-blocking 참조)

## Target Files

- `supabase/migrations/` — 신규 `0054_point_ledger_redemption_reasons.sql`(`point_ledger.reason` CHECK 확장·`finalize_penalty_proof` RPC·carry-over 수금 RPC)
- `packages/domain/src/settlement.ts` — `SettlementReason`에 `'penalty_debt_carryover'` 추가
- `apps/web/tests/integration/` — 신규 `redemption-carryover.spec.ts`(전체 흐름 회귀)

## Requirements

- `0054` migration: `point_ledger.reason` CHECK 확장(`ALTER DROP/ADD CONSTRAINT` — native enum 아님). 기존 reason 값 보존.
- `finalize_penalty_proof` RPC: `accepted` → 원장 행 없음(면제). `rejected`/`expired` → `penalty_debts(amount=2X, status='open')` INSERT.
- carry-over 수금 RPC(service_role 전용, `SECURITY DEFINER`+`search_path`): 같은 `group_id` 다음 정산에서 open debt를 찾아 `point_ledger`에 `reason='penalty_debt_carryover'`·`delta=-2X`·`ref_id=penalty_debts.id` INSERT(멱등 — `ref_id` UNIQUE). `pool_points`에 2X 합산. debt `settled` 닫음. 사후 `settlements` UPDATE 없음.
- `delta <> 0` CHECK 통과 필수(면제 시 delta 0 행 생성 금지). `0044` 편집 금지.

## Non-goals

- analytics·`group_pool_ledger`·미회수 탕감·Phase 2 — 후속·out of scope

## Acceptance Criteria

| 기준                                              | 검증 방법                                  |
| ------------------------------------------------- | ------------------------------------------ |
| accepted → 면제(원장 무변화) / rejected → 2X debt | `pnpm test -- settlement` + CI Integration |
| carry-over 멱등(2회 호출 → 1건)                   | integration `redemption-carryover.spec.ts` |
| `settlements` 불변(사후 UPDATE 없음)              | integration 회귀                           |
| harness 추적성                                    | `pnpm harness:check`                       |

## Verification Commands

```bash
pnpm typecheck && pnpm lint
pnpm test -- settlement
pnpm harness:check
pnpm test:integration -- redemption-carryover
```

## Expected Output Summary

migration 0054 범위(`point_ledger.reason` CHECK 확장·`finalize_penalty_proof` RPC·carry-over 수금), 멱등 보증(`ref_id` UNIQUE) 설계, `settlements` 불변성 유지 근거(INSERT-once), deferred→accepted/rejected→carry-over 세 경로 테스트 결과를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1~6: 폴더/명명/의존/커맨드/하네스/`.agents/` 변경 여부를 확인하고 yes 항목은 `evals/drift-reports/`에 노트.

## Stop Condition

AC 전부 green + `pnpm harness:check` 통과. pass@3 미달 → split(05 §9.4).

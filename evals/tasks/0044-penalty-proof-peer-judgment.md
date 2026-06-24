---
Task: EVAL-0044
Track: greenfield
Kind: migration
Status: blocked
Blocked-by: [task:EVAL-0042] — `challenges.penalty_mission`·`challengeInputSchema` 확장이 먼저 존재해야 한다.
Depends-on: [task:EVAL-0043] — `action-videos` 버킷을 penalty 증명 제출에 재사용(순서 의존, 하드 게이트 아님).
Parent: docs/superpowers/specs/2026-06-23-feed-type-penalty-redesign-design.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0044: 벌칙 증명 제출·동료 판단(peer-reject 미러) 구현

> spec §C3·C4 및 Rollout ③ 구현. `penalty_proofs`·`penalty_proof_rejections`·`penalty_debts` 테이블 + `toggle_penalty_proof_rejection` RPC, `challenge/[id]/penalty/**` 화면(창1/창2 타임라인), "벌칙 대기" 진입점 UI를 포함한다.

## Parent Links

- Parent PRD Feature: spec §C3 · §C4 — [2026-06-23-feed-type-penalty-redesign-design.md](../../docs/superpowers/specs/2026-06-23-feed-type-penalty-redesign-design.md)
- Parent Test Scenario: SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: SoT 없음 — AT eval 흡수
- Parent Engineering Story: SoT 없음 — AT eval 흡수
- Parent Work Package: `feat/penalty-proof-peer-judgment`

## Goal

`0053` migration으로 `penalty_proofs`·`penalty_proof_rejections`·`penalty_debts` + `toggle_penalty_proof_rejection` RPC(peer-reject 과반 미러)가 생성된다. `challenge/[id]/penalty/**` 화면이 창2 상태(제출·판단·만료)를 렌더하고, home에 "벌칙 대기" 진입 섹션이 추가된다.

## Source Files to Inspect

- `supabase/migrations/0048_peer_rejections.sql` — `peer_rejections`·`toggle_peer_rejection` RPC 패턴(미러 기준 SoT)
- `apps/web/src/app/(app)/challenge/[id]/(tabs)/dashboard/page.tsx` — 기존 챌린지 상세 화면 구조
- `apps/web/src/lib/db/reads/current-challenges.ts` — `status in (pending,accepted,active)` 쿼리(진입점 갭 SoT)
- `packages/domain/src/challenge/weekly.ts` — `confirmedPenalty` 산정 흐름 확인
- `packages/domain/src/validators/peer-rejection.ts` — peer-rejection zod 스키마 패턴

## Target Files

- `supabase/migrations/` — 신규 `0053_penalty_redemption.sql`(`penalty_proofs`·`penalty_proof_rejections`·`penalty_debts`·`toggle_penalty_proof_rejection` RPC)
- `apps/web/src/app/(app)/challenge/[id]/` — 신규 `penalty/` route(`page.tsx`·`_components/`·`_actions.ts`)
- `apps/web/src/app/(app)/challenge/[id]/_components/` — "벌칙 대기" 진입 섹션 컴포넌트(기존 디렉토리 활용)
- `apps/web/src/lib/db/reads/` — 신규 `penalty-status.ts`(벌칙 상태 read)
- `packages/domain/src/validators/` — 신규 `penalty.ts`(벌칙 증명 zod 스키마)

## Requirements

- `0053` migration: `penalty_proofs`(UNIQUE `(challenge_id,user_id)`, status CHECK `pending/accepted/rejected/expired`), `penalty_proof_rejections`(UNIQUE `(proof_id,voter_id)`), `penalty_debts`(status `open/settled`). `toggle_penalty_proof_rejection(p_proof_id)` RPC: `toggle_peer_rejection`과 동일 공식(`reject_count > (N-1)/2`). `SECURITY DEFINER`+`search_path`. 전 테이블 RLS ON, write=RPC만, voter SELECT=본인 행만.
- `challenge/[id]/penalty/**`: 창2(`closed`+`종료+48h~96h`) 제출·판단·만료 UI. `<Suspense>`+loading/error 패턴.
- home "벌칙 대기" 섹션: `closed`+`penalty_mission IS NOT NULL`+open proof 챌린지 노출(`SettlementPendingList` 미러).
- 소그룹 동작: 솔로 → 판단자 0 → 항상 인정. 별도 floor 없음.

## Non-goals

- carry-over 수금·`point_ledger.reason` 확장·redemption 정산 — EVAL-0045
- analytics·Phase 2·만료 cron — 후속·out of scope

## Acceptance Criteria

| 기준                                       | 검증 방법                 |
| ------------------------------------------ | ------------------------- |
| `toggle_penalty_proof_rejection` 과반 공식 | `pnpm test -- penalty`    |
| RLS write=RPC만, voter 익명성              | CI Integration            |
| 창2 UI 상태 렌더·home 진입 섹션            | 모바일 수동 확인(dogfood) |
| harness 추적성                             | `pnpm harness:check`      |

## Verification Commands

```bash
pnpm typecheck && pnpm lint
pnpm test -- penalty
pnpm harness:check
pnpm test:integration -- penalty-proof-rls
```

## Expected Output Summary

migration 0053 범위(3테이블·RPC), `toggle_peer_rejection` 미러 공식 구현 근거, 소그룹 동작 수용 이유, 창2 UI 화면 상태 처리, home 진입점 패턴을 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1~6: 폴더/명명/의존/커맨드/하네스/`.agents/` 변경 여부를 확인하고 yes 항목은 `evals/drift-reports/`에 노트.

## Stop Condition

AC 전부 green + `pnpm harness:check` 통과. pass@3 미달 → split(05 §9.4).

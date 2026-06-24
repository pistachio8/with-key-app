---
Task: EVAL-0042
Track: greenfield
Kind: migration
Status: done
Blocked-by: [adr:penalty-redemption-settlement] [adr:feed-type-video-capture] — RESOLVED 2026-06-24 PO 수락 완료(ADR-0039·ADR-0040 accepted). `settlements_guard_writes` INSERT-once Blocker·deferred penalty 분기는 ADR-0039에 확정.
Parent: docs/superpowers/specs/2026-06-23-feed-type-penalty-redesign-design.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0042: 피드 타입·벌칙 미션 스키마 + 도메인 레이어 추가

> spec §C1·C5 및 Rollout ① 구현. `challenges.feed_type`·`challenges.penalty_mission` migration, `challengeInputSchema` 확장, `settlement.ts` deferred penalty 분기가 이 task 의 범위다. EVAL-0043~0045 가 의존하는 스키마·도메인 SoT를 확립한다.

## Parent Links

- Parent PRD Feature: spec §C1 · §C5 — [2026-06-23-feed-type-penalty-redesign-design.md](../../docs/superpowers/specs/2026-06-23-feed-type-penalty-redesign-design.md)
- Parent Test Scenario: SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: SoT 없음 — AT eval 흡수
- Parent Engineering Story: SoT 없음 — AT eval 흡수
- Parent Work Package: `feat/feed-type-schema-domain`

## Goal

`0051` migration으로 `challenges.feed_type`·`penalty_mission` 컬럼이 추가·backfill되고, `challengeInputSchema`에 `feedType`·`penaltyMission` 필드가 추가된다. `computeSettlement`는 벌칙 챌린지에서 penalty를 deferred 처리한다. `settle_challenge` RPC가 단일 INSERT로 재설계돼 `settlements_guard_writes` Blocker가 해소된다.

## Source Files to Inspect

- **화면 시안(디자인 SoT)** — `docs/mockups/2026-06-24-feed-type-penalty/challenge-new.html` 생성 폼(피드 타입 토글 이미지/3초 영상·만회 찬스 미션 입력 ≤80자·기본값 image). 전체 흐름·다른 화면은 허브 `docs/mockups/2026-06-24-feed-type-penalty-screens.html` ▶ 로 확인 (spec §화면 시안)
- `packages/domain/src/validators/challenge.ts` — `challengeInputSchema` 현행 필드 확인
- `packages/domain/src/settlement.ts` — `computeSettlement`(L68), `SettlementResult.distribution` 타입(L53), `SettlementReason`(L21)
- `supabase/migrations/0022_create_challenge_rpc_fix.sql` — `create_challenge` 현행 RPC 시그니처
- `supabase/migrations/0044_settlement_rpcs.sql` — `settle_challenge` 현행(placeholder-INSERT→UPDATE 패턴, ⚠️ Blocker)·`settlements_guard_writes` 트리거 함수
- `supabase/migrations/0043_settlements.sql` — `settlements_guard_writes` 트리거 정의
- `docs/adr/0032-settlement-verification-data-model.md` — settlement 불변성 원칙

## Target Files

- `supabase/migrations/` — 신규 `0051_feed_type_penalty_mission.sql`(`challenges` 컬럼 추가·backfill·`create_challenge` RPC 갱신·`settle_challenge` INSERT-once 재설계)
- `packages/domain/src/validators/challenge.ts` — `feedType`·`penaltyMission` 필드 추가
- `packages/domain/src/settlement.ts` — deferred penalty 분기, `SettlementReason` `'penalty_debt_carryover'` 추가, `SettlementResult` 메타 확장

## Requirements

- `0051` migration: `challenges.feed_type text not null default 'image' check (feed_type in ('image','video'))`, `challenges.penalty_mission text nullable`. 기존 행 backfill(`feed_type='image'`). RLS 기존 정책 유지.
- `create_challenge` RPC: `p_feed_type text default 'image'`·`p_penalty_mission text default null` 파라미터 추가. 단일 시그니처 유지(오버로드 금지). `SECURITY DEFINER`+`search_path` 보존. `0044` 편집 금지 — forward `create or replace`.
- `settle_challenge` **단일 INSERT** 재설계: pool/distribution 먼저 계산 → 최종값 1회 INSERT. placeholder-INSERT→UPDATE 패턴 제거(`settlements_guard_writes` 통과). `0044` 편집 금지.
- `challengeInputSchema`: `feedType: z.enum(["image","video"]).default("image")`, `penaltyMission: z.string().min(1).max(80).optional()`.
- `computeSettlement`: `penaltyMission?` 입력 추가. 있으면 penalty 행 미생성 + `redemption_pending: true` 메타. `SettlementReason`에 `'penalty_debt_carryover'` 추가.
- 전 테이블 RLS ON·migration append-only·단방향 유지. `docs/BE_SCHEMA.md` 갱신.

## Non-goals

- 영상·벌칙 증명 테이블(`penalty_proofs`·`penalty_debts`) — EVAL-0043~0044
- `point_ledger.reason` CHECK 확장·carry-over 수금 — EVAL-0045
- analytics 이벤트·챌린지 생성 UI·recap 분기·몽타주 — 후속 WP

## Acceptance Criteria

| 기준                                                                  | 검증 방법                                          |
| --------------------------------------------------------------------- | -------------------------------------------------- |
| `feed_type` 컬럼·backfill                                             | `pnpm supabase db reset` 후 기존 행 `'image'` 확인 |
| `settle_challenge` 단일 INSERT(`settlements_guard_writes` 통과)       | CI Integration: RPC 실호출 UPDATE 없음 확인        |
| `computeSettlement` deferred — `penaltyMission`있을 때 penalty 미생성 | `pnpm test -- settlement`                          |
| `challengeInputSchema` 기본값·회귀 없음                               | `pnpm test -- challenge`                           |
| harness 추적성                                                        | `pnpm harness:check` 통과                          |

## Verification Commands

```bash
pnpm typecheck && pnpm lint
pnpm test -- settlement
pnpm test -- challenge
pnpm harness:check
pnpm test:integration -- settle-challenge-insert-once
```

## Expected Output Summary

migration 0051 범위(컬럼 추가·backfill·RPC 갱신·`settle_challenge` INSERT-once 재설계), `computeSettlement` deferred 분기 구현 근거, `settlements_guard_writes` Blocker 해소 증거, `challengeInputSchema` 기본값 보존 단위 테스트 결과를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1~6: 폴더/명명/의존/커맨드/하네스/`.agents/` 변경 여부를 확인하고 yes 항목은 `evals/drift-reports/`에 노트.

## Stop Condition

AC 전부 green + `pnpm harness:check` 통과. pass@3 미달 → split(05 §9.4).

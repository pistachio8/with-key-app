---
Task: EVAL-0040
Track: greenfield
Kind: regression
Status: todo
Depends-on: [task:EVAL-0006] — EVAL-0006(정산 RPC + _settlement_confirmed_penalties 원본 구현)의 직접 후속. EVAL-0032·0039 계열(peer_rejected 제외)의 settlement 버전. 기계 읽는 토큰은 task:EVAL-0006 뿐.
Parent: docs/eng-stories/2026-06-05-points-settlement.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0040: 🐞 정산 penalty 산정 RPC가 peer_rejected 인증을 done으로 세던 버그 수정

> EVAL-0039 Non-goal 이관: EVAL-0039가 대시보드 링·칩의 peer_rejected 제외를 수정했지만 "정산 pot/penalty peer_rejected 제외 — EVAL-0008 후속"을 Non-goal로 명시 제외했다. `_settlement_confirmed_penalties` RPC의 `done_days` CTE가 `auto_verify_status <> 'peer_rejected'` 필터 없이 join 하므로, 반려당한 멤버의 done 수가 과다 계산되어 미달 penalty가 과소 산정된다.

## Parent Links

- PRD: `AC-settle-4` — [01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.C (미달분 주 단위 누적 산정) / `AC-peer-reject-2` — §5.B (peer_rejected = doneCount 제외)
- TS: SoT 없음 — AT eval 흡수(05 §2 D10)
- JS: `JS-settle-3` — [p1-settlement-job-stories](../../docs/stories/2026-06-05-p1-settlement-job-stories.md)
- Eng: [points-settlement](../../docs/eng-stories/2026-06-05-points-settlement.md) WP2 후속
- WP: `fix/settlement-penalty-peer-reject`

## Goal

`_settlement_confirmed_penalties` RPC의 `done_days` CTE가 `peer_rejected` 인증을 done 집계에서 제외한다. 새 forward migration `0050_fix_settlement_confirmed_penalties_peer_reject.sql`에서 함수 전체 body를 `create or replace`로 재정의하되, `done_days` CTE의 join 조건에 `and al.auto_verify_status <> 'peer_rejected'` 한 줄만 추가한다. `security definer` + `set search_path = public` 보존, 다른 RPC 불변. 이 task가 끝나면 passed+peer_rejected 혼재 시 미달 penalty가 정확히 산정되고, passed-only 케이스는 회귀 없다.

## Source Files to Inspect

- `supabase/migrations/0044_settlement_rpcs.sql` — `_settlement_confirmed_penalties`(L106~) 및 `settle_challenge`(L345~) 원본. `done_days` CTE(L145~157)가 버그 지점.
- `supabase/migrations/0045_action_logs_verify_columns.sql` — L20·L30: `auto_verify_status='peer_rejected'`는 "주간 카운트 제외" 대상으로 명시 정의됨(정책 SoT).
- `apps/web/src/lib/db/reads/challenge-detail.ts` — L70-76: `visibleByUserByWeek` 계산 시 `peer_rejected` 제외 패턴 참조(동일 제외 패턴 SoT).
- `packages/domain/src/settlement.spec.ts` — 기존 settlement 테스트 위치(회귀 테스트 추가 대상).
- `evals/tasks/0039-fix-peer-reject-week-ring-chips.md` — EVAL-0039 Non-goal 이관 근거.
- `evals/tasks/0032-fix-peer-reject-board-donecount.md` — 동일 계열 패턴.

## Target Files

- `supabase/migrations/` — 신규 `0050_fix_settlement_confirmed_penalties_peer_reject.sql` (번호 append, 재정렬 금지)
- `packages/domain/src/settlement.spec.ts` — 회귀 테스트 추가

> 회귀 테스트 주의: 로컬 Supabase 스택 없음(config.toml/CLI 없음 — project memory). SQL-level 통합 테스트는 불가. `_settlement_confirmed_penalties` RPC 자체가 SQL이므로 domain/단위 레벨에서는 "RPC contract"를 직접 실행할 수 없다. 대신 `packages/domain/src/settlement.spec.ts`에 **"peer_rejected가 있는 경우 confirmedPenalty가 올바르게 산정된다"는 도메인 수준 단언**을 추가한다 — RPC는 이 contract를 구현하므로 forward migration과 함께 명세 계약이 된다. SQL 실측은 CI Integration 잡(PR migration apply 후 공유 Supabase)이 담당한다.

## Requirements

- `0050_*.sql`: `create or replace function public._settlement_confirmed_penalties(p_challenge_id uuid)` 전체 body를 재정의. `done_days` CTE의 `join public.action_logs al ...` 이후(L155 또는 L157 범위)에 `and al.auto_verify_status <> 'peer_rejected'` 한 줄 추가.
- `security definer` + `set search_path = public` + `language sql stable` 보존.
- `settle_challenge` · `grant_bundle_points` · `hold_deposit` · `deposit_release` · `distribute_pool` — 다른 RPC 변경 금지.
- `0044_settlement_rpcs.sql` 편집 금지(append-only, forward 0050 only).
- `packages/domain/src/settlement.spec.ts`: passed+peer_rejected 혼재 시 `confirmedPenalty`가 peer_rejected 제외 기준으로 산정된다는 계약 단언 추가. 기존 `computeSettlement` 테스트 green 유지.

## Non-goals

- `apps/web/src/lib/challenge/weekly.ts` TS `confirmedPenalty` 산식 — 이번 범위 아님(SQL RPC만).
- 정산 트리거·cron(EVAL-0008), 보증금 hold UI(EVAL-0007), pool 재분배.
- 피드 배지, 주차 링·칩(EVAL-0039 처리 완료).
- 익명성·peer_rejections 메커니즘(0048).
- 캐시 revalidate, AnalyticsEvent 추가.
- `weekly.ts` 로직 변경.

## SPEC_CHECK 판단 항목 (구현 단계 사람 판단)

migration 변경은 spec-required 경로(`supabase/migrations/**`)이므로 ADR이 권장된다. 그러나:

- `0045_action_logs_verify_columns.sql` L30 comment가 이미 "peer_rejected = 주간 카운트 제외"를 정책으로 선언했다.
- `docs/adr/0032-settlement-verification-data-model.md`가 정산 데이터 모델 전반을 관장하며, 본 버그픽스는 그 ADR이 의도한 정책의 RPC 구현 누락을 보완하는 것이다.

**구현 에이전트 판단**: 신규 ADR이 필요한지(기존 ADR-0032 참조 + migration comment만으로 충분) vs 간단한 bugfix 주석 migration으로 처리할지 — PR 리뷰어(pistachio8)가 최종 결정. 자동으로 ADR을 생성하거나 생략하지 말 것.

## Acceptance Criteria

| 기준                                                                                | 검증 방법                                          |
| ----------------------------------------------------------------------------------- | -------------------------------------------------- |
| passed+peer_rejected 혼재 시 peer_rejected를 done에서 제외 → 미달 penalty 정상 산정 | `packages/domain/src/settlement.spec.ts` 신규 단언 |
| passed-only 케이스 회귀 없음                                                        | 기존 `settlement.spec.ts` 테스트 green             |
| 기존 settlement 테스트 전체 green                                                   | `pnpm test -- settlement`                          |
| `security definer` · `search_path` · 다른 RPC 불변                                  | migration 코드 리뷰 + `pnpm harness:check` 통과    |

## Verification Commands

```bash
pnpm harness:context EVAL-0040
pnpm typecheck && pnpm lint
pnpm test -- settlement
pnpm harness:check
```

## Expected Output Summary

`done_days` CTE peer_rejected 제외 1줄 추가 범위, `security definer` · `search_path` 보존 근거, domain 레벨 회귀 테스트 결과, SQL 실측은 CI Integration 위임 이유, SPEC_CHECK(ADR) 판단 요청을 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. 폴더? No. 2. 명명? No. 3. 의존? No. 4. 검증 커맨드? No. 5. 하네스 outdated? No. 6. `.agents/`? No.

## Stop Condition

AC 전부 green + `pnpm harness:check` 통과. pass@3 미달 → split(05 §9.4).

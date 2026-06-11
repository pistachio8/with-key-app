---
Task: EVAL-0008
Track: greenfield
Kind: migration
Status: blocked
Blocked-by: G2(법무) 통과 + P2 peer-reject(48h 이의 마감) 의존. 선행 WP1·WP2(EVAL-0005·0006).
Parent: docs/eng-stories/2026-06-05-points-settlement.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0008: 정산 트리거 + auto-settle cron — 그룹장 확정 / 72h 자동

> WP4 (`feat/rn-settlement-trigger`). **G2 + P2 blocked** — 정산 트리거는 법무 게이트 후, 48h 이의 마감은 P2 peer-reject 의존. 데이터·RPC는 EVAL-0005·0006 의존.

## Parent Links

- PRD: `AC-settle-trigger-1`~`3`·`AC-settle-trigger-4`(이벤트) · `AC-settle-1` — [01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.C
- TS: `TS-settle-trigger-1`~`3` · `TS-settle-1` — [test-scenarios.md](../../docs/pm/test-scenarios.md)
- JS: `JS-settle-4` — [p1-settlement-job-stories.md](../../docs/stories/2026-06-05-p1-settlement-job-stories.md)
- Eng: [points-settlement](../../docs/eng-stories/2026-06-05-points-settlement.md) WP4
- WP: `feat/rn-settlement-trigger`

## Goal

정산 실행 시점 배선. 완료 시: 그룹장 "정산 확정" → `settle_challenge` RPC 호출, 48h 이의·반려 창 후 수동 확정 가능, 72h 미트리거 시 cron이 `settled_by=auto`로 자동 정산, 클릭+cron 동시에도 `settlements` PK + `on conflict do nothing`으로 이중 정산 결정론적 차단.

## Source Files to Inspect

- `docs/adr/0032-settlement-verification-data-model.md`
- `docs/adr/0030-early-close-settlement-cutoff.md`
- `docs/eng-stories/2026-06-05-points-settlement.md`
- `docs/pm/acceptance-criteria.md`
- `docs/pm/test-scenarios.md`
- `apps/web/src/app/(app)/challenge`
- `apps/web/src/app/api/cron`
- `supabase/migrations/0041_challenge_closed_at.sql`

## Target Files

- `apps/web/src/app/(app)/challenge` — 그룹장 종료 화면 "정산 확정" 트리거(확정만, 재량 분배 아님)
- `apps/web/src/app/api/cron` — 마감 후 72h auto-settle cron (Route Handler — 외부 콜백 전용 경로)
- `supabase/migrations/` — 필요 시 cron 보조 view/RPC (예: 미정산 마감 챌린지 조회)

## Requirements

- 그룹장 확정은 **확정만**(분배 규칙은 시작 시 고정, `AC-settle-5`). `AC-settle-trigger-1`.
- 트리거 타임라인: 마감 → 48h 이의(P2) → 그룹장 수동(그 전 언제든) → 72h cron. `AC-settle-trigger-2`.
- cron: 73h+ 미트리거 → `settled_by=auto`. 30h엔 0건. `TS-settle-trigger-1`.
- 이중정산 방지: 클릭+cron 동시여도 멱등 → `settlements` 1행·원장 0행. `AC-settle-trigger-3` (`TS-settle-trigger-2`).
- 정산 직전 반려로 doneCount 감소 시 갱신된 doneCount로 penalty 재계산. `TS-settle-trigger-3`.
- 정산 결과: 달성자 release + 미달분 공동풀 이월 + 스냅샷. `AC-settle-1`·`AC-settle-7`.

## Non-goals

- RPC 구현(`settle_challenge`/`distribute_pool`) — EVAL-0006 (본 task는 트리거·스케줄만).
- 48h peer-reject UI/로직 — P2 별도(본 task는 창 경계만 참조).
- AnalyticsEvent union 정의 — EVAL-0009.
- **사용자향 활성** — G2 + P2 통과 후.

## Acceptance Criteria

| 기준                                       | 검증 방법                                                        |
| ------------------------------------------ | ---------------------------------------------------------------- |
| 그룹장 확정 트리거 (`AC-settle-trigger-1`) | `TS-settle-trigger-1`: "정산 확정" → settle_challenge 1회        |
| 72h auto-settle (`AC-settle-trigger-2`)    | `TS-settle-trigger-1`: 30h→0건, 73h→`settled_by=auto` 1행        |
| 이중정산 방지 (`AC-settle-trigger-3`)      | `TS-settle-trigger-2`: 클릭+cron 동시 → settlements 1행·원장 0행 |
| 직전 doneCount 변동                        | `TS-settle-trigger-3`: 반려 감소 → 갱신 doneCount로 penalty 산정 |
| harness traceability                       | `pnpm harness:check` 통과                                        |

## Verification Commands

```bash
pnpm harness:context EVAL-0008
pnpm typecheck && pnpm lint
pnpm test -- settle-trigger
pnpm harness:check
# cron 동작·동시성 idempotency는 CI/스테이징에서 (로컬 스택 없음) — G2+P2 활성 후
```

## Expected Output Summary

트리거 타임라인(48h/72h) 배선 위치, 그룹장 확정·cron 경로, idempotency 보장, doneCount 재계산 시점, G2+P2 전 보류 범위를 한국어로 요약한다.

## Harness Impact Questions

1–6. No — 폴더(`src/app/api/cron`)/네이밍/의존성(기존 Vercel cron)/커맨드/harness/`.agents/` 모두 기존 유지.

## Stop Condition

- G2+P2 해제 후 AC green + cron idempotency 확인 + `pnpm harness:check` 통과.
- blocked 동안: 구조·테스트 작성 가능.
- pass@3 실패 → 그룹장 트리거 / cron auto-settle로 split(컨텍스트 1회 점검 후).

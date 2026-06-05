---
Task: EVAL-0008
Track: greenfield
Kind: migration
Status: blocked
Blocked-by: G2(법무) 통과 + P2 peer-reject(48h 이의 마감) 의존. 선행 WP1·WP2(EVAL-0005·0006).
Parent: docs/eng-stories/2026-06-05-points-settlement.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0008: 정산 트리거 + auto-settle cron — 그룹장 확정 / 72h 자동

> Work Package WP4 (`feat/rn-settlement-trigger`). **G2 + P2 blocked** — 사용자향 정산 트리거는 법무 게이트 후, 48h 이의 마감은 P2 peer-reject에 의존. 데이터·RPC는 EVAL-0005·0006 산출물에 의존.

## Parent Links

- Parent PRD Feature: `AC-settle-trigger-1`(그룹장 정산 확정) · `AC-settle-trigger-2`(48h/72h auto-settle) · `AC-settle-trigger-3`(이중정산 방지) · `AC-settle-trigger-4`(이벤트) · `AC-settle-1`(달성자 환급·미달분 풀) — [docs/migration/01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.C
- Parent Test Scenario: `TS-settle-trigger-1`(48h/72h) · `TS-settle-trigger-2`(idempotency) · `TS-settle-trigger-3`(직전 doneCount 변동) · `TS-settle-1` — [docs/pm/test-scenarios.md](../../docs/pm/test-scenarios.md)
- Parent Job Story: `JS-settle-4`(그룹장 "정산" 한 번, 깜빡해도 자동) — [docs/pm/job-stories.md](../../docs/pm/job-stories.md)
- Parent Engineering Story: [2026-06-05-points-settlement](../../docs/eng-stories/2026-06-05-points-settlement.md) WP4
- Parent Work Package: `feat/rn-settlement-trigger` (WP4)

## Goal

정산 실행 시점을 배선한다. 이 task가 끝나면 그룹장이 종료 화면에서 "정산 확정"을 누르면 `settle_challenge` RPC가 호출되고, 마감 후 48h 이의·반려 창이 지나면 그룹장이 그 전 언제든 수동 확정 가능하며, 72h까지 미트리거면 cron이 `settled_by=auto`로 자동 정산하고, 클릭과 cron이 동시에 발생해도 `settlements` PK + `on conflict do nothing`으로 이중 정산이 결정론적으로 차단된다.

## Source Files to Inspect

- `docs/adr/0032-settlement-verification-data-model.md`
- `docs/adr/0030-early-close-settlement-cutoff.md`
- `docs/eng-stories/2026-06-05-points-settlement.md`
- `docs/pm/acceptance-criteria.md`
- `docs/pm/test-scenarios.md`
- `src/app/(app)/challenge`
- `src/app/api/cron`
- `supabase/migrations/0041_challenge_closed_at.sql`

## Target Files

- `src/app/(app)/challenge` — 그룹장 종료 화면 "정산 확정" 트리거(확정만, 재량 분배 아님)
- `src/app/api/cron` — 마감 후 72h auto-settle cron (Route Handler — 외부 콜백 전용 경로)
- `supabase/migrations/` — 필요 시 cron 보조 view/RPC (예: 미정산 마감 챌린지 조회)

## Requirements

- 그룹장 "정산 확정"은 **확정만** 트리거 — 재량 분배 아님(분배 규칙은 시작 시 고정, `AC-settle-5`). `AC-settle-trigger-1`.
- 트리거 타임라인: 마감 → 48h 이의·반려 창(P2 peer-reject) → 그룹장 수동(그 전 언제든) → 72h cron auto-settle. `AC-settle-trigger-2`.
- cron: 마감 후 73h+ 미트리거 챌린지를 `settled_by=auto`로 정산. 30h 시점엔 미실행(정산 0건). `TS-settle-trigger-1`.
- 이중정산 방지: 클릭+cron 동시여도 `settle_challenge` 멱등 → `settlements` 1행 유지·추가 원장 0행. `AC-settle-trigger-3` (`TS-settle-trigger-2`).
- 정산 직전 반려로 doneCount 감소 시 갱신된 doneCount로 penalty 재계산. `TS-settle-trigger-3`.
- 정산 결과: 달성자 release + 미달분 그룹 공동 주머니 이월 + 스냅샷 저장. `AC-settle-1`·`AC-settle-7`.

## Non-goals

- `settle_challenge`/`distribute_pool` RPC 구현 자체 — WP2/EVAL-0006 (본 task는 트리거·스케줄 배선).
- 48h 이의·반려(peer-reject) UI/로직 — P2 별도(본 task는 창 경계만 참조).
- AnalyticsEvent union 정의 — WP5/EVAL-0009.
- **사용자향 활성** — G2 + P2 통과 후.

## Acceptance Criteria

| 기준                                       | 검증 방법                                                             |
| ------------------------------------------ | --------------------------------------------------------------------- |
| 그룹장 확정 트리거 (`AC-settle-trigger-1`) | `TS-settle-trigger-1`: 종료 화면 "정산 확정" → settle_challenge 1회   |
| 72h auto-settle (`AC-settle-trigger-2`)    | `TS-settle-trigger-1`: 30h→0건, 73h→`settled_by=auto` 1행             |
| 이중정산 방지 (`AC-settle-trigger-3`)      | `TS-settle-trigger-2`: 클릭+cron 동시 → settlements 1행·추가 원장 0행 |
| 직전 doneCount 변동                        | `TS-settle-trigger-3`: 반려로 감소 → 갱신 doneCount로 penalty 산정    |
| harness traceability                       | `pnpm harness:check` 통과                                             |

## Verification Commands

```bash
pnpm harness:context EVAL-0008
pnpm typecheck && pnpm lint
pnpm test -- settle-trigger
pnpm harness:check
# cron 동작·동시성 idempotency는 CI/스테이징에서 (로컬 스택 없음) — G2+P2 활성 후
```

## Expected Output Summary

트리거 타임라인(48h/72h)의 배선 위치, 그룹장 확정과 cron 경로, 동시 트리거 idempotency 보장, doneCount 재계산 시점, G2+P2 전 보류 범위를 한국어로 요약한다.

## Harness Impact Questions

1. New folder structure? No — `src/app/api/cron` 기존 위치.
2. New naming convention? No.
3. New dependency? No (스케줄러는 기존 Vercel cron 사용 가정).
4. Verification commands changed? No.
5. Harness instructions outdated? No.
6. `.agents/` 문서 갱신? No.

## Stop Condition

- G2+P2 해제 후 Acceptance Criteria green + cron 동시성 idempotency 확인 + `pnpm harness:check` 통과.
- blocked 동안: 구조·테스트 작성까지 진행 가능.
- pass@3 안에 green 못 만들면 → 그룹장 트리거 / cron auto-settle 로 split (프롬프트·컨텍스트 1회 점검 후).

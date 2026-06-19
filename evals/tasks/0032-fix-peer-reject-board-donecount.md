---
Task: EVAL-0032
Track: greenfield
Kind: regression
Status: done
Depends-on: [task:EVAL-0025] — EVAL-0025(🟨 피어 반려 RPC·전이) 위에서 발견된 read 표시 누락 버그. 기계 읽는 토큰은 task:EVAL-0025 뿐.
Parent: docs/eng-stories/2026-06-05-photo-verification.md, docs/adr/0038-reaction-storage-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0032: 🐞 멤버 현황판 doneCount 에 peer_rejected 반영 — 과반 반려가 상세 보드에 안 보이던 버그

> dogfood 버그(#qa 2026-06-19): 과반(4명 중 2명) 피어 반려가 챌린지 상세 멤버 현황판에 반영 안 됨. EVAL-0025 의 `doneCount 제외` 의도가 상세 read 에 미배선.

## Parent Links

- PRD: `AC-peer-reject-2` — [01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.B (과반 → `peer_rejected`, doneCount 제외)
- TS: SoT 없음 — AT eval 흡수(05 §2 D10)
- JS: `JS-verify-5` — [p2-job-stories](../../docs/stories/2026-06-05-p2-verification-job-stories.md)
- Eng: [photo-verification](../../docs/eng-stories/2026-06-05-photo-verification.md) WP5 후속
- WP: `fix/peer-reject-board-donecount`

## Goal

챌린지 상세 멤버 현황판의 `doneCount`(표시 집합)가 `auto_verify_status='peer_rejected'` 로그를 제외한다. 과반 피어 반려가 즉시 보드에 반영되어 dogfood 버그가 해소된다. RPC(0048)·전이는 정상이며(모든 로그 `default 'passed'` 시작), 표시 read 만 EVAL-0025 의 `doneCount 제외` 의도에 맞게 배선한다.

## Source Files to Inspect

- `apps/web/src/lib/db/reads/challenge-detail.ts` (멤버 strip read — 버그 지점)
- `apps/web/src/lib/db/reads/current-challenges.ts` (표시 집합 vs pot 집합 분리 — **재사용 패턴 SoT**)
- `supabase/migrations/0048_peer_rejections.sql` · `0045_action_logs_verify_columns.sql` (전이·`default 'passed'`)

## Target Files

- `apps/web/src/lib/db/reads/challenge-detail.ts` — 멤버 표시 doneCount 가 peer_rejected 제외
- `apps/web/src/lib/db/reads/challenge-detail.spec.ts` (없으면 신설) — peer_rejected 제외 회귀 테스트

## Requirements

- `challenge-detail.ts` 의 멤버 select 에 `auto_verify_status` 포함, 멤버 **표시** `doneCount` 가 `peer_rejected` 로그를 제외한다.
- 표시 집합과 **정산(pot/penalty) 집합을 분리** — `computeAccruedPot` 에 들어가는 `doneByWeek` 는 full 집합 그대로(`current-challenges.ts` 패턴 미러).
- 회귀 테스트: 같은 멤버의 passed 1건 + peer_rejected 1건일 때 표시 doneCount 가 passed 만 센다.

## Non-goals

- 정산 측 peer_rejected 제외(pot/penalty 재계산) — EVAL-0008 후속(역방향 의존), **건드리지 않음**.
- RPC/전이/익명성/48h 로직(0048) — 정상, 변경 없음.
- 피드 배지·캐시 revalidate·홈 ring(이미 viewer-own 제외) — 본 task 범위 밖.
- `failed/manual_review/pending` 표시 처리(EVAL-0022 Non-goal).

## Acceptance Criteria

| 기준                              | 검증 방법                                                         |
| --------------------------------- | ----------------------------------------------------------------- |
| 표시 doneCount peer_rejected 제외 | passed+peer_rejected 혼재 멤버 → doneCount=passed 수, 단위 테스트 |
| 정산 집합 불변                    | `computeAccruedPot` 입력 `doneByWeek` 는 full 유지(pot 회귀 없음) |
| 기존 동작 보존                    | 기존 `challenge-detail`·`current-challenges` 테스트 green         |
| harness traceability              | `pnpm harness:check` 통과                                         |

## Verification Commands

```bash
pnpm harness:context EVAL-0032
pnpm typecheck && pnpm lint
pnpm test -- challenge-detail
pnpm harness:check
```

## Expected Output Summary

표시 doneCount 가 peer_rejected 를 제외하도록 challenge-detail read 를 배선한 범위, pot 집합을 full 로 분리 유지한 근거(EVAL-0008 역방향), 추가한 회귀 테스트, dogfood 버그(#qa) 재현→해소를 한국어로 요약한다.

## Harness Impact Questions

1. 폴더? No. 2. 명명? No. 3. 의존? No. 4. 검증 커맨드? No. 5. 하네스 outdated? No. 6. `.agents/`? No — 기존 가드레일·패턴(`current-challenges.ts`) 내 수정.

## Stop Condition

- 표시 doneCount peer_rejected 제외 + pot 집합 불변 + 회귀 테스트 green + `pnpm harness:check` 통과.
- pass@3 미달 → read 분리/테스트 split(05 §9.4).

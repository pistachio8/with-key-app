---
Task: EVAL-0041
Track: greenfield
Kind: regression
Status: in_progress
Depends-on: [task:EVAL-0040] — EVAL-0040(정산 penalty RPC peer_rejected 제외)의 화면-read 대응물. RPC가 peer_rejected를 제외하므로 recap read의 penalty 집계도 일치시켜야 한다. 기계 읽는 토큰은 task:EVAL-0040 뿐.
Parent: docs/eng-stories/2026-06-05-points-settlement.md, docs/adr/0032-settlement-verification-data-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0041: 🐞 정산 recap 화면이 peer_rejected 인증을 done으로 세던 버그 수정

> EVAL-0040 화면-read 대응물: EVAL-0040이 정산 penalty RPC(`_settlement_confirmed_penalties`)의 `done_days` CTE에서 peer_rejected를 제외했으나, recap 화면이 읽는 `fetchRecap`(recap.ts)은 `action_logs` select에 `auto_verify_status` 필터가 없어 peer_rejected 피드가 `countDoneDaysByUserByWeek` 집계에 그대로 포함된다. 이로 인해 인증 횟수(viewerDoneCount)·달성 판정(viewerAchieved/members[].achieved)·정산 금액(viewerPerHeadPenalty) 세 값 모두 peer_rejected 포함 기준으로 잘못 표시된다. RPC와 화면이 어긋난 상태.

## Parent Links

- PRD: `AC-settle-4` — [01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.C (미달분 주 단위 누적 산정) / `AC-peer-reject-2` — §5.B (peer_rejected = doneCount 제외)
- TS: SoT 없음 — AT eval 흡수(05 §2 D10)
- JS: `JS-settle-3` — [p1-settlement-job-stories](../../docs/stories/2026-06-05-p1-settlement-job-stories.md)
- Eng: [points-settlement](../../docs/eng-stories/2026-06-05-points-settlement.md) WP2 후속
- WP: `fix/settlement-penalty-peer-reject`

## Goal

`fetchRecap`의 `action_logs` select에 `auto_verify_status`를 포함하고, `countDoneDaysByUserByWeek` 호출 전에 `peer_rejected` 로그를 필터링한다. 이 단일 집합으로 `doneByWeek`를 만들어 `buildRecapView`에 전달한다. 이 task가 끝나면 recap 화면의 viewerDoneCount·viewerAchieved·viewerPerHeadPenalty가 모두 peer_rejected를 제외한 기준으로 표시되고, 정산 RPC(EVAL-0040) 결과와 일치한다.

## Source Files to Inspect

- `apps/web/src/lib/db/reads/recap.ts` — L162~165 버그 지점(select 누락), L169~179 집계 조립.
- `apps/web/src/lib/db/reads/challenge-detail.ts` — L59-62 select, L72-78 peer_rejected 필터 패턴 SoT.
- `apps/web/src/lib/db/reads/current-challenges.ts` — 동일 제외 패턴 참조.
- `apps/web/src/lib/db/reads/recap.spec.ts` — 기존 테스트 구조(추가 대상).
- `evals/tasks/0040-fix-settlement-penalty-peer-reject.md` — RPC 수정 선행 맥락.

## Target Files

- `apps/web/src/lib/db/reads/recap.ts` — `action_logs` select 및 `byUserByWeek` 집계 수정
- `apps/web/src/lib/db/reads/recap.spec.ts` — peer_rejected 제외 단위 테스트 추가

## Requirements

- `action_logs` select에 `auto_verify_status` 추가: `.select("user_id, created_at, auto_verify_status")`.
- `countDoneDaysByUserByWeek` 호출 전 필터: `(logs ?? []).filter((l) => l.auto_verify_status !== "peer_rejected")`.
- 단일 제외 집합 — 표시·penalty·달성 모두 같은 집합 사용. 근거: EVAL-0040 RPC도 peer_rejected 단일 제외이므로 분리 시 RPC와 어긋남.
- `buildRecapView` 시그니처·`ParticipantRow.doneByWeek` 타입 변경 없음 — 집계 입력만 교체.
- `recap.spec.ts` 신규 케이스: passed 3건 중 1건 peer_rejected → `viewerDoneCount=2`, `viewerAchieved=false`(goal=3), `viewerPerHeadPenalty>0` 단언. `buildRecapView`는 조립된 Map 입력 방식 그대로.
- 기존 spec 5개 케이스 전부 green 유지.

## Non-goals

- `buildRecapView` 내부 로직·시그니처 변경, `challenge-detail.ts`·`current-challenges.ts` 수정.
- 정산 RPC/migration(EVAL-0040 완료), 트리거·cron(EVAL-0008), 보증금 UI(EVAL-0007).
- 피드 배지, 링·칩(EVAL-0039), 멤버 현황판(EVAL-0032), 익명성(0048).
- 캐시 revalidate, AnalyticsEvent, 표시용·penalty용 집합 분리(recap은 단일 제외 집합).

## Acceptance Criteria

| 기준                                                             | 검증 방법                                                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| passed+peer_rejected 혼재 시 peer_rejected가 doneByWeek에서 제외 | `recap.spec.ts` 신규 케이스 — `viewerDoneCount`, `viewerAchieved`, `viewerPerHeadPenalty` 단언 |
| 기존 closed/over/조기종료 케이스 회귀 없음                       | 기존 spec 5개 green                                                                            |
| `pnpm typecheck` · `pnpm lint` 통과                              | CI 통과                                                                                        |
| harness 추적성                                                   | `pnpm harness:check` 통과                                                                      |

## Verification Commands

```bash
pnpm harness:context EVAL-0041
pnpm typecheck && pnpm lint
pnpm test -- recap
pnpm harness:check
```

## Expected Output Summary

select 수정 범위, 단일 제외 집합 근거(EVAL-0040 RPC 정합), 기존 spec 5개 회귀 결과, 신규 peer_rejected 케이스 단언 내용을 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1~6 전부 No — 폴더/명명/의존/검증커맨드/하네스/`.agents/` 변경 없음.

## Stop Condition

AC 전부 green + `pnpm harness:check` 통과. pass@3 미달 → split(05 §9.4).

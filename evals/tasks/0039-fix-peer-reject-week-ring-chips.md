---
Task: EVAL-0039
Track: greenfield
Kind: regression
Status: done
Depends-on: [task:EVAL-0032] — EVAL-0032(멤버 현황판 doneCount peer_rejected 제외)의 직접 후속. 같은 표면의 표시 집합 분리를 링·칩으로 확장한다. 기계 읽는 토큰은 task:EVAL-0032 뿐.
Parent: docs/eng-stories/2026-06-05-photo-verification.md, docs/adr/0038-reaction-storage-model.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0039: 🐞 대시보드 주차 링·칩이 peer_rejected 인증을 done으로 세던 버그 수정

> dogfood 후속(EVAL-0032 Non-goal 이관): EVAL-0032가 챌린지 상세 멤버 현황판 doneCount를 수정했지만 같은 표면의 "이번 주 진척" 링·"주차 기록" 칩은 Non-goal로 명시 제외했다. `auto_verify_status='peer_rejected'` 인증이 링·칩에서 여전히 done으로 계산된다.

## Parent Links

- PRD: `AC-peer-reject-2` — [01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §5.B (과반 → `peer_rejected`, doneCount 제외)
- TS: SoT 없음 — AT eval 흡수(05 §2 D10)
- JS: `JS-verify-5` — [p2-job-stories](../../docs/stories/2026-06-05-p2-verification-job-stories.md)
- Eng: [photo-verification](../../docs/eng-stories/2026-06-05-photo-verification.md) WP5 후속
- WP: `fix/peer-reject-week-ring-chips`

## Goal

대시보드 링·칩이 `peer_rejected` 인증을 제외한 주차 집계로 렌더된다. `ChallengeMemberView`에 `visibleDoneByWeek`(표시용)를 추가하고, `dashboard/page.tsx` 링·칩에 이를 전달한다. `doneByWeek`(full)와 `computeAccruedPot` 입력은 변경 없이 유지된다.

## Source Files to Inspect

- `apps/web/src/lib/db/reads/challenge-detail.ts` — L70-76 `visibleByUserByWeek` 계산됨. L78-92 멤버 조립: `doneByWeek`(full)만 담고 `visibleByWeek` 버려짐 — 수정 지점.
- `apps/web/src/app/(app)/challenge/[id]/(tabs)/dashboard/page.tsx` — L46 `viewer?.doneByWeek`(full) → L59-60 링·칩 — 버그 지점.
- `apps/web/src/lib/db/reads/current-challenges.ts` — 표시≠pot 분리 패턴 SoT.
- `packages/domain/src/challenge/weekly.ts` — 시그니처 확인(변경 없음).
- `evals/tasks/0032-fix-peer-reject-board-donecount.md` — 직전 패턴.

## Target Files

- `apps/web/src/lib/db/reads/challenge-detail.ts`
- `apps/web/src/app/(app)/challenge/[id]/(tabs)/dashboard/page.tsx`
- `apps/web/src/lib/db/reads/challenge-detail.spec.ts`

## Requirements

- `ChallengeMemberView`에 `visibleDoneByWeek: ReadonlyMap<number, number>` 추가(서버 전용 — `doneByWeek` 동일 패턴).
- 멤버 조립: `visibleByUserByWeek.get(p.user_id) ?? new Map()`을 `visibleDoneByWeek`에 담는다.
- `dashboard/page.tsx`: 링·칩 입력을 `viewer?.visibleDoneByWeek`로 교체. `computeAccruedPot` 입력 `doneByWeek` 수정 금지.
- `weekly.ts` 시그니처 변경 없음 — 입력 Map만 교체.
- 회귀 테스트: passed+peer_rejected 혼재 시 `visibleDoneByWeek`=passed만, `doneByWeek`=양쪽 포함을 단언.

## Non-goals

- 정산 pot/penalty peer_rejected 제외 — EVAL-0008 후속, `computeAccruedPot` 입력 `doneByWeek` full 유지.
- 멤버 현황판 doneCount — EVAL-0032 처리 완료.
- RPC/전이/익명성/48h(0048), 피드 배지, 캐시 revalidate, 홈 링.
- `weekly.ts` 로직 변경 — 입력 Map만 교체.

## Acceptance Criteria

| 기준                                   | 검증 방법                                                   |
| -------------------------------------- | ----------------------------------------------------------- |
| 링·칩이 peer_rejected 제외 집계로 렌더 | `visibleDoneByWeek`에 passed만 포함, 단위 테스트            |
| pot 집합 불변                          | `doneByWeek`(full)가 passed+peer_rejected 포함, 단위 테스트 |
| 기존 동작 보존                         | 기존 `challenge-detail`·`current-challenges` 테스트 green   |
| harness traceability                   | `pnpm harness:check` 통과                                   |

## Verification Commands

```bash
pnpm harness:context EVAL-0039
pnpm typecheck && pnpm lint
pnpm test -- challenge-detail
pnpm harness:check
```

## Expected Output Summary

`visibleDoneByWeek` 추가·배선 범위, pot 집합 full 유지 근거, 회귀 테스트 결과를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. 폴더? No. 2. 명명? No. 3. 의존? No. 4. 검증 커맨드? No. 5. 하네스 outdated? No. 6. `.agents/`? No.

## Stop Condition

AC 전부 green + `pnpm harness:check` 통과. pass@3 미달 → split(05 §9.4).

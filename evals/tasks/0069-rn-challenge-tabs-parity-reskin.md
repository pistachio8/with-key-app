---
Task: EVAL-0069
Track: port
Kind: migration
Status: todo
Depends-on: [task:EVAL-0067] — 토큰 확장 완료 전에는 parity 를 사후 강제할 수 없다(ADR-0044·spec §C). (EVAL-0067 #304 머지로 해제)
Parent: docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md
---

# EVAL-0069: RN challenge 상세 3탭(feed·dashboard·info) parity re-skin (P0)

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0069` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10). spec: docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md §A(`/challenge/[id]`·`/dashboard`·`/info` 행) / ADR: docs/adr/0044-rn-screen-visual-parity.md
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-screen-parity-challenge-tabs` (base: develop, EVAL-0067 머지 후)

## Goal

`challenge/[id]` 상세의 feed·dashboard·info 3 화면을 EVAL-0067 확장 토큰으로 재도장한다. 세 화면은 `ChallengeScaffold` 공용 셸을 공유하고 spec §A 에서 동일하게 "IA 재배치(challenge 탭 navigator) + 컴포넌트 parity"로 분류돼 토큰 적용 패턴이 같다 — 이 공통성을 근거로 1 task 로 묶는다(과대 분해 방지, "1 capability = 1 AT" 휴리스틱; pass@3 실패 시 재분할). screenshot acceptance(spec §B)를 3 화면 모두 DoD 로 통과한다.

## Source Files to Inspect

- `apps/web/src/app/(app)/challenge/[id]/(tabs)/page.tsx` · `dashboard/page.tsx` · `info/page.tsx` — PWA 원본
- `apps/mobile/src/app/(app)/challenge/[id]/index.tsx` · `dashboard.tsx` · `info.tsx` — 현재 native 구현(EVAL-0017)
- `apps/mobile/src/features/challenge/components/challenge-scaffold.tsx` · `member-progress-list.tsx` — 공용 셸·컴포넌트
- `apps/mobile/src/features/feed/components/feed-card.tsx` — feed 카드 컴포넌트
- `apps/mobile/src/shared/theme/index.ts` — EVAL-0067 확장 토큰
- `docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md` §A·§B

## Target Files

- `apps/mobile/src/features/challenge/components/challenge-scaffold.tsx`
- `apps/mobile/src/features/challenge/components/member-progress-list.tsx`
- `apps/mobile/src/features/feed/components/feed-card.tsx`
- `apps/mobile/src/app/(app)/challenge/[id]/index.tsx`
- `apps/mobile/src/app/(app)/challenge/[id]/dashboard.tsx`
- `apps/mobile/src/app/(app)/challenge/[id]/info.tsx`

## Requirements

- `ChallengeScaffold` 헤더·탭 인디케이터 색/타이포를 EVAL-0067 토큰으로 치환 — 3 화면 즉시 상속.
- feed: `FeedCard`·`TodaySummary` 를 PWA `FeedSection` 대비 컴포넌트 parity.
- dashboard: pot 카드·`MemberProgressList` parity(`doneByWeek` 확장은 미포팅 범위 유지).
- info: 정보 카드·서명 리스트·계좌 카드 parity.
- 3 화면 모두 "컴포넌트 parity + 탭 IA 적합"으로 판정(spec §A, IA 재배치 오판 방지).
- 로딩·빈·오류 상태 parity, RLS 비멤버 경계(feed 401/403) 유지.

## Non-goals

- dashboard `doneByWeek` 주차 칩/링 확장(ADR-0037 §2, 후속 task).
- action·pledge·recap·home 등 다른 화면 스타일.
- feed·challenge-reads read 계약 변경.

## Acceptance Criteria

| 기준                                  | 검증 방법                                         |
| ------------------------------------- | ------------------------------------------------- |
| 3 화면 토큰화(하드코딩 제거)          | 코드 검토                                         |
| feed-card 렌더 비파괴                 | `pnpm --filter @withkey/mobile test -- feed-card` |
| 전 모바일 테스트 회귀 없음            | `pnpm --filter @withkey/mobile test`              |
| screenshot acceptance 375/320(3 화면) | PR 첨부 + 수동 확인(spec §B)                      |
| typecheck·lint 이상 없음              | 아래 verify 커맨드                                |
| harness 추적성                        | `pnpm harness:check`                              |

## Verification Commands

```bash
pnpm --filter @withkey/mobile test -- feed-card
pnpm --filter @withkey/mobile test
pnpm --filter @withkey/mobile exec tsc --noEmit
pnpm --filter @withkey/mobile lint
pnpm harness:check
pnpm validate:docs
# manual: 375·320pt PWA/RN feed·dashboard·info side-by-side 비교, spec §B-3 1~5 확인 후 PR 첨부
```

## Expected Output Summary

3 화면 공용 셸·컴포넌트 토큰화 내역, feed/dashboard/info 각각의 IA 재배치+컴포넌트 parity 판단 근거, 로딩/빈/오류 상태 확인, 375·320 screenshot 비교 결과(3 화면분)를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. New folder structure? No.
2. New naming convention? No.
3. New dependency? 없음.
4. Verification commands changed? screenshot 수동 비교(3 화면) 신규 — drift-reports 노트.
5. Harness outdated? 판단 필요.
6. `.agents/` update? → yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- 3 화면 토큰화 + 전체 테스트 비파괴 + typecheck·lint green + `pnpm harness:check` 통과 + screenshot acceptance(375·320) 증거 + Harness Impact 답변 완료.
- pass@3 안 되면 → feed/dashboard/info 를 개별 task 로 split-work-packages 분할.

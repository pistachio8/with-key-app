---
Task: EVAL-0079
Track: port
Kind: migration
Status: todo
Depends-on: [task:EVAL-0067] — 신규 화면이라 토큰 없이 만들면 하드코딩 스타일이 남아 parity 를 사후 강제할 수 없다(ADR-0044·spec §C). (EVAL-0067 #304 머지로 해제)
Parent: docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md
---

# EVAL-0079: RN me/challenges 화면 신규 구현 + 1:1 parity (P2)

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0079` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10). spec: docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md §A(`/me/challenges` 행, 미구현, 1:1 parity, P2) / ADR: docs/adr/0044-rn-screen-visual-parity.md
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-screen-parity-me-challenges` (base: develop, EVAL-0067 머지 후)

## Goal

`/me/challenges`(챌린지 관리 — 운영/참여 분리 + 운영 슬롯 차트 + 종료된 챌린지)는 RN 에 화면 자체가 없는 **미구현 화면**이다(spec §A, re-skin 아님, 신규 build). `apps/mobile/src/app/(app)/me/challenges.tsx`를 신규 구현하며 기존 `fetchMyChallenges` read 계약을 재사용하고 EVAL-0067 확장 토큰으로 처음부터 parity 를 적용한다. PWA `/me/challenges`와 "1:1 parity" 분류(spec §A)를 목표로 한다. screenshot acceptance(spec §B)를 DoD 로 통과한다.

## Source Files to Inspect

- `apps/web/src/app/(app)/me/challenges/page.tsx` (및 `_components/manage-card-list.tsx` · `challenge-limit-chart.tsx`) — PWA 원본(OWNER_LIMIT=5 운영 슬롯 차트, active/pending/accepted vs closed 분리)
- `apps/mobile/src/features/challenge/api/challenge-reads.ts` — `fetchMyChallenges`(owner/member 분리, 이미 포팅됨) 재사용, 변경 금지
- `apps/mobile/src/shared/ui/index.ts` — EVAL-0059 `EmptyState` primitive
- `apps/mobile/src/shared/theme/index.ts` — EVAL-0067 확장 토큰
- `docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md` §A·§B

## Target Files

- `apps/mobile/src/features/challenge/api/challenge-reads.ts` — 구조 선례 확인(수정 없음, 패턴 참조용)
- 신규: apps/mobile/src/app/(app)/me/challenges.tsx

## Requirements

- `fetchMyChallenges(userId)`로 운영(owner)/참여(member) 카드 리스트 렌더, status rank(active>accepted>pending>closed) 는 기존 정렬 유지.
- active/pending/accepted 는 "운영 중"/"참여 중" 섹션, closed 는 별도 "종료된 챌린지" 섹션으로 분리(PWA 동일 기준).
- 운영 슬롯 차트(`OWNER_LIMIT=5` 대비 현재 운영 수) — 값·라벨은 web `challenge-limit-chart.tsx` parity.
- 빈 상태(owner·member 모두 0)는 `EmptyState` primitive 로 parity(§B-3 #4).
- `/challenge/new` 진입 CTA 유지(생성 상한 도달 시 비활성/안내는 PWA parity 확인).
- StyleSheet 는 EVAL-0067 확장 토큰만 사용 — 하드코딩 hex/px 금지.

## Non-goals

- `fetchMyChallenges` 계약 변경.
- 챌린지 나가기·삭제 등 관리 mutation(PWA 에 있으면 후속 판단, 없으면 신설 금지).
- `/me` 카드(EVAL-0076)·notifications(EVAL-0078) 스타일 변경.

## Acceptance Criteria

| 기준                                              | 검증 방법                                              |
| ------------------------------------------------- | ------------------------------------------------------ |
| me/challenges.tsx 신규 — 운영/참여/종료 섹션 렌더 | `pnpm --filter @withkey/mobile test`                   |
| 운영 슬롯 차트 값·라벨 parity                     | `pnpm --filter @withkey/mobile test`                   |
| 빈 상태 EmptyState 렌더                           | `pnpm --filter @withkey/mobile test`                   |
| screenshot acceptance 375/320 + 체크리스트 5항    | PR 첨부 + 수동 side-by-side 확인(spec §B, 자동화 불가) |
| typecheck·lint 이상 없음                          | 아래 verify 커맨드                                     |
| harness 추적성                                    | `pnpm harness:check`                                   |

## Verification Commands

```bash
pnpm --filter @withkey/mobile test
pnpm --filter @withkey/mobile exec tsc --noEmit
pnpm --filter @withkey/mobile lint
pnpm harness:check
pnpm validate:docs
# manual: 375pt·320pt 뷰포트에서 PWA/RN me/challenges 화면 side-by-side 비교(운영/참여/종료 섹션+빈 상태), spec §B-3 체크리스트 1~5 확인 후 PR 첨부
```

## Expected Output Summary

me/challenges.tsx 신규 구현 내역(섹션 분리·운영 슬롯 차트·빈 상태), 1:1 parity 판단 근거, 375·320 screenshot 비교 결과를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? `app/(app)/me/challenges.tsx` 라우트 신규 — drift-reports 노트.
2. Did this task introduce a new naming convention? No.
3. Did this task introduce a new dependency? 없음.
4. Did this task change verification commands? screenshot 수동 비교 절차 신규 — drift-reports 노트.
5. Did this task reveal that the current harness instructions are outdated? 판단 필요.
6. Should any `.agents/` document be updated? → yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- me/challenges.tsx 신규 구현(운영/참여/종료 섹션·슬롯 차트·빈 상태) + typecheck·lint green + `pnpm harness:check` 통과 + screenshot acceptance(375·320) 증거 첨부 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → 태스크 과대, split-work-packages 로 분할.

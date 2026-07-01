---
Task: EVAL-0068
Track: port
Kind: migration
Status: todo
Depends-on: [task:EVAL-0067] — 토큰 확장 완료 전에는 parity 를 사후 강제할 수 없다(ADR-0044·spec §C). (EVAL-0067 #304 머지로 해제)
Parent: docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md
---

# EVAL-0068: RN home 화면 parity re-skin — IA 재배치 + 컴포넌트 parity (P0)

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0068` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10). spec: docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md §A(`/home` 행) / ADR: docs/adr/0044-rn-screen-visual-parity.md
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-screen-parity-home` (base: develop, EVAL-0067 머지 후)

## Goal

`apps/mobile/src/app/(app)/(tabs)/home.tsx`와 홈 컴포넌트(`home-overview.tsx`·`start-challenge-card.tsx`)를 EVAL-0067 확장 토큰으로 재도장한다. PWA `/home`과 "IA 재배치(탭 셸) + 컴포넌트 parity" 분류(spec §A)로 검증한다 — 전체 레이아웃 동일이 아니라 화면 내 컴포넌트(진행 카드·미서명 배너·통계)의 parity 가 목표다. screenshot acceptance(spec §B, 375/320 + 체크리스트 5항)를 DoD 로 통과한다.

## Source Files to Inspect

- `apps/web/src/app/(app)/home/page.tsx` — PWA 원본 레이아웃·컴포넌트 위계
- `apps/mobile/src/app/(app)/(tabs)/home.tsx` — 현재 native 구현(EVAL-0017)
- `apps/mobile/src/features/challenge/components/home-overview.tsx` · `start-challenge-card.tsx` — home 컴포넌트
- `apps/mobile/src/shared/theme/index.ts` — EVAL-0067 확장 토큰(colors·typography·radius·spacing)
- `docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md` §A·§B

## Target Files

- `apps/mobile/src/app/(app)/(tabs)/home.tsx`
- `apps/mobile/src/features/challenge/components/home-overview.tsx`
- `apps/mobile/src/features/challenge/components/start-challenge-card.tsx`

## Requirements

- StyleSheet 하드코딩 hex/px 값을 EVAL-0067 확장 토큰(colors·typography·radius·spacing)으로 치환한다.
- 정보 위계(진행 챌린지 카드 → 미서명 배너 → 통계)는 컴포넌트 단위로 PWA 와 parity를 맞춘다. 탭 셸(Bottom Tabs) 재배치는 실패 사유가 아니다(spec §A "IA 재배치").
- 로딩·빈·오류 상태 각각 parity(spec §B-3 #4) — 위계·문구 톤이 PWA 와 일치.
- safe-area·탭바 등 native 관용은 유지한다(§B-3 #5, "PWA 와 다름"이 정상).
- 기존 read 계약(EVAL-0016/0017)·렌더 테스트는 비파괴로 유지한다.

## Non-goals

- read 계약(`fetchChallengeDetail` 등) 변경, 신규 API 호출.
- Bottom Tabs 구조 자체 변경(04-rn-architecture §3 확정).
- challenge 상세·action·pledge·recap 등 다른 화면 스타일 변경.

## Acceptance Criteria

| 기준                                           | 검증 방법                                              |
| ---------------------------------------------- | ------------------------------------------------------ |
| StyleSheet 토큰화(하드코딩 hex/px 제거)        | 코드 검토                                              |
| 기존 read-only 렌더 테스트 비파괴              | `pnpm --filter @withkey/mobile test -- home-overview`  |
| 전 모바일 테스트 회귀 없음                     | `pnpm --filter @withkey/mobile test`                   |
| screenshot acceptance 375/320 + 체크리스트 5항 | PR 첨부 + 수동 side-by-side 확인(spec §B, 자동화 불가) |
| typecheck·lint 이상 없음                       | 아래 verify 커맨드                                     |
| harness 추적성                                 | `pnpm harness:check`                                   |

## Verification Commands

```bash
pnpm --filter @withkey/mobile test -- home-overview
pnpm --filter @withkey/mobile test
pnpm --filter @withkey/mobile exec tsc --noEmit
pnpm --filter @withkey/mobile lint
pnpm harness:check
pnpm validate:docs
# manual: 375pt·320pt 뷰포트에서 PWA/RN home 화면 side-by-side 비교, spec §B-3 체크리스트 1~5 확인 후 PR 첨부
```

## Expected Output Summary

토큰화한 StyleSheet 값 목록, 컴포넌트 parity 판단 근거(IA 재배치 vs 1:1), 로딩/빈/오류 상태 확인 결과, 375·320 screenshot 비교 결과를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? No.
2. Did this task introduce a new naming convention? No.
3. Did this task introduce a new dependency? 없음.
4. Did this task change verification commands? screenshot 수동 비교 절차 신규 — drift-reports 노트.
5. Did this task reveal that the current harness instructions are outdated? 판단 필요.
6. Should any `.agents/` document be updated? → yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- 토큰화 완료 + 기존 렌더/전체 테스트 비파괴 + typecheck·lint green + `pnpm harness:check` 통과 + screenshot acceptance(375·320) 증거 첨부 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → 태스크 과대, split-work-packages 로 분할.

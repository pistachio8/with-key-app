---
Task: EVAL-0073
Track: port
Kind: migration
Status: in_progress
Depends-on: [task:EVAL-0067] — 토큰 확장 완료 후 착수해야 재작업이 없다(하드 게이트 아님, 순서 권장).
Parent: docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md
---

# EVAL-0073: RN challenge/new(+done) 화면 1:1 parity re-skin (P1)

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0073` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10). spec: docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md §A(`/challenge/new`(+`/done/[id]`) 행, 1:1 parity, P1) / ADR: docs/adr/0044-rn-screen-visual-parity.md
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-screen-parity-challenge-new` (base: develop)

## Goal

`apps/mobile/src/app/(app)/(flow)/challenge/new.tsx`(생성 폼 + 완료 후 `CreationDone` 공유 시트, 단일 파일)를 EVAL-0067 확장 토큰으로 재도장한다. PWA `/challenge/new`+`/challenge/new/done/[id]`와 "1:1 parity" 분류(spec §A)를 목표로 한다. screenshot acceptance(spec §B)를 DoD 로 통과한다.

## Source Files to Inspect

- `apps/web/src/app/(flow)/challenge/new/page.tsx` · `done/[id]/page.tsx` — PWA 원본
- `apps/mobile/src/app/(app)/(flow)/challenge/new.tsx` — 현재 native 구현(생성 폼 + `CreationDone` 인라인)
- `apps/mobile/src/shared/theme/index.ts` — EVAL-0067 확장 토큰
- `docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md` §A·§B

## Target Files

- `apps/mobile/src/app/(app)/(flow)/challenge/new.tsx`

## Requirements

- StyleSheet 하드코딩 hex/px 값을 EVAL-0067 확장 토큰(colors·typography·radius·spacing)으로 치환한다.
- 생성 폼(제목·기간·인증 빈도·벌금 등 입력 순서)과 완료 화면(초대 공유)의 정보 위계가 PWA 와 parity(1:1, §B-3 #1).
- 핵심 인터랙션(입력 검증·생성 제출·공유 CTA)이 PWA 와 동등하게 동작(§B-3 #3).
- 로딩(생성 중)·오류(생성 실패·초대 발급 실패 비치명 처리) 상태 parity(§B-3 #4).
- `createChallenge`·`createInvite` 등 기존 write 계약은 변경하지 않는다.

## Non-goals

- owner group 선택 로직·`create_challenge` RPC 계약 변경.
- P0 화면(home·challenge 탭·action·pledge·recap) 스타일 변경.
- 초대 재발급 UI(group/[id] 범위, 본 화면엔 없음).

## Acceptance Criteria

| 기준                                           | 검증 방법                                              |
| ---------------------------------------------- | ------------------------------------------------------ |
| StyleSheet 토큰화(하드코딩 hex/px 제거)        | 코드 검토                                              |
| 전 모바일 테스트 회귀 없음                     | `pnpm --filter @withkey/mobile test`                   |
| screenshot acceptance 375/320 + 체크리스트 5항 | PR 첨부 + 수동 side-by-side 확인(spec §B, 자동화 불가) |
| typecheck·lint 이상 없음                       | 아래 verify 커맨드                                     |
| harness 추적성                                 | `pnpm harness:check`                                   |

## Verification Commands

```bash
pnpm --filter @withkey/mobile test
pnpm --filter @withkey/mobile exec tsc --noEmit
pnpm --filter @withkey/mobile lint
pnpm harness:check
pnpm validate:docs
# manual: 375pt·320pt 뷰포트에서 PWA/RN challenge/new + done 화면 side-by-side 비교, spec §B-3 체크리스트 1~5 확인 후 PR 첨부
```

## Expected Output Summary

토큰화한 StyleSheet 값 목록, 생성 폼·완료 화면 1:1 parity 판단 근거, 로딩/오류 상태 확인, 375·320 screenshot 비교 결과를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? No.
2. Did this task introduce a new naming convention? No.
3. Did this task introduce a new dependency? 없음.
4. Did this task change verification commands? screenshot 수동 비교 절차 신규 — drift-reports 노트.
5. Did this task reveal that the current harness instructions are outdated? 판단 필요.
6. Should any `.agents/` document be updated? → yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- 토큰화 완료 + 전체 테스트 비파괴 + typecheck·lint green + `pnpm harness:check` 통과 + screenshot acceptance(375·320) 증거 첨부 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → 태스크 과대, split-work-packages 로 분할.

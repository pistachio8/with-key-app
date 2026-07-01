---
Task: EVAL-0070
Track: port
Kind: migration
Status: todo
Depends-on: [task:EVAL-0067] — 토큰 확장 완료 전에는 parity 를 사후 강제할 수 없다(ADR-0044·spec §C). (EVAL-0067 #304 머지로 해제)
Parent: docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md
---

# EVAL-0070: RN action(사진 인증) 화면 1:1 parity re-skin (P0)

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0070` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10). spec: docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md §A(`/challenge/[id]/action` 행, 1:1 parity) / ADR: docs/adr/0044-rn-screen-visual-parity.md
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-screen-parity-action` (base: develop, EVAL-0067 머지 후)

## Goal

`apps/mobile/src/app/(app)/challenge/[id]/action.tsx`(활동 선택 → 키워드 → 사진 촬영/선택 → 압축 → 제출)를 EVAL-0067 확장 토큰으로 재도장한다. PWA `/challenge/[id]/action`과 "1:1 parity" 분류(spec §A) — 레이아웃 구조·정보 위계가 PWA 와 일치해야 한다. screenshot acceptance(spec §B)를 DoD 로 통과한다.

## Source Files to Inspect

- `apps/web/src/app/(app)/challenge/[id]/action/page.tsx` (및 `action-form.tsx` 등 관련 컴포넌트) — PWA 원본
- `apps/mobile/src/app/(app)/challenge/[id]/action.tsx` — 현재 native 구현(EVAL-0019, 활동/키워드/사진/제출 단일 파일)
- `apps/mobile/src/shared/theme/index.ts` — EVAL-0067 확장 토큰
- `docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md` §A·§B

## Target Files

- `apps/mobile/src/app/(app)/challenge/[id]/action.tsx`

## Requirements

- StyleSheet 하드코딩 hex/px 값을 EVAL-0067 확장 토큰(colors·typography·radius·spacing)으로 치환한다.
- 활동 선택 칩 → 키워드 picker → 사진 미리보기 → 제출 버튼의 순서·상대 크기·강조가 PWA 와 parity(1:1, spec §B-3 #1).
- 핵심 인터랙션(활동 선택·키워드 reroll·사진 재촬영·제출 로딩)이 PWA 와 동등하게 동작(§B-3 #3).
- 로딩(제출 중)·오류(업로드 실패·권한 거부) 상태 parity(§B-3 #4).
- 카메라·이미지 피커 권한 UX 는 native 관용 유지(§B-3 #5).
- `submitActionLog`·`preparePhotoForUpload` 등 기존 write 계약은 변경하지 않는다.

## Non-goals

- 사진 압축/업로드 정책(`upload-policy.ts`) 변경 — 별도 domain 관심사.
- AI 일기·키워드 풀 로직 변경(POC freeze, `packages/domain/src/keywords/pool.ts`).
- home·challenge 탭·pledge·recap 등 다른 화면 스타일 변경.

## Acceptance Criteria

| 기준                                               | 검증 방법                                              |
| -------------------------------------------------- | ------------------------------------------------------ |
| StyleSheet 토큰화(하드코딩 hex/px 제거)            | 코드 검토                                              |
| submit-action-log·upload-policy 기존 테스트 비파괴 | `pnpm --filter @withkey/mobile test -- action-log`     |
| 전 모바일 테스트 회귀 없음                         | `pnpm --filter @withkey/mobile test`                   |
| screenshot acceptance 375/320 + 체크리스트 5항     | PR 첨부 + 수동 side-by-side 확인(spec §B, 자동화 불가) |
| typecheck·lint 이상 없음                           | 아래 verify 커맨드                                     |
| harness 추적성                                     | `pnpm harness:check`                                   |

## Verification Commands

```bash
pnpm --filter @withkey/mobile test -- action-log
pnpm --filter @withkey/mobile test
pnpm --filter @withkey/mobile exec tsc --noEmit
pnpm --filter @withkey/mobile lint
pnpm harness:check
pnpm validate:docs
# manual: 375pt·320pt 뷰포트에서 PWA/RN action 화면 side-by-side 비교(활동 선택·키워드·사진·제출 상태 포함), spec §B-3 체크리스트 1~5 확인 후 PR 첨부
```

## Expected Output Summary

토큰화한 StyleSheet 값 목록, 1:1 parity 판단 근거(레이아웃·인터랙션), 로딩/오류 상태 확인, 375·320 screenshot 비교 결과를 한국어로 요약한다.

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

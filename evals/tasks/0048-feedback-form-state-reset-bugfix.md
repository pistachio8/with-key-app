---
Task: EVAL-0048
Track: greenfield
Kind: migration
Status: todo
Depends-on: [task:EVAL-0029] — 건의하기 폼·완료 페이지 최초 구현(EVAL-0027~0029)이 재진입 경로의 SoT. 게이트 아님(착수 가능).
Parent: docs/PRD.md
---

# EVAL-0048: 건의하기 완료 후 재진입 시 입력 폼 재노출 (state reset 버그픽스)

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0048` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: QA_TRIAGE.md B12 / feedback id `ec828571` (2026-06-16) — TS SoT 없음, AT eval 흡수(05 §2 D10)
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `fix/feedback-form-state-reset`

## Goal

건의하기 제출 완료 후 같은 세션에서 건의하기 페이지에 재진입하면 완료(thank-you) 상태가 초기화되어 입력 폼이 다시 표시된다. 현재는 제출 성공 분기가 완료 상태를 리셋하지 않아 재진입 시에도 완료 화면만 노출된다.

## Source Files to Inspect

- `apps/web/src/app/(app)/me/feedback/page.tsx` — 완료 상태 분기 진입점
- `apps/web/src/app/(app)/me/feedback/_components/feedback-form.tsx` — 폼 컴포넌트·제출 성공 후 상태 전이
- `apps/web/src/app/(app)/me/feedback/_actions.ts` — Server Action submit 결과 반환 shape
- `apps/web/src/app/(app)/me/feedback/_components/feedback-form.spec.tsx` — 기존 단위 테스트(재현 테스트 추가 대상)

## Target Files

- `apps/web/src/app/(app)/me/feedback/_components/feedback-form.tsx` — 완료 상태 리셋 로직 추가 또는 수정
- `apps/web/src/app/(app)/me/feedback/_components/feedback-form.spec.tsx` — 재현 테스트 추가(재진입→입력 폼 노출)
- `apps/web/src/app/(app)/me/feedback/page.tsx` — route 진입 시 완료 상태 초기화 여부 확인(필요 시 수정)

## Requirements

- 건의하기 제출 성공 후 완료(thank-you) 화면을 보여준다.
- 같은 세션에서 `/me/feedback` 경로에 재진입하면 완료 상태가 리셋되어 입력 폼이 표시된다.
- 재진입은 뒤로가기 후 다시 건의하기 진입 및 직접 URL 네비게이션 두 경로를 모두 포함한다.
- 기존 제출 성공 플로우(완료 화면 노출)가 깨지지 않아야 한다.

## Non-goals

- 건의하기 Server Action(`_actions.ts`)의 DB 로직·`feedback` 테이블 스키마 변경 — 이번 버그는 클라이언트 상태 문제로 추정
- 건의하기 디자인 변경·다른 폼(프로필·챌린지 폼 등)
- 기존 QA B1/B3(제출 성공 후 폼 state/route 리셋) 범위 — 해당 클러스터와 근본원인이 같을 수 있으나 surface가 건의 폼으로 별도; SPEC_CHECK 에서 중복 여부 확정

## Acceptance Criteria

| 기준                                           | 검증 방법                                                |
| ---------------------------------------------- | -------------------------------------------------------- |
| 재현 테스트: 제출 성공 → 재진입 → 입력 폼 노출 | `pnpm test -- feedback-form` (신규 테스트 추가 후 green) |
| 기존 제출 성공 플로우 회귀 없음                | `pnpm test -- feedback-form` 기존 케이스 포함            |
| TypeScript 컴파일 이상 없음                    | `pnpm typecheck`                                         |
| ESLint 이상 없음                               | `pnpm lint`                                              |
| harness 추적성                                 | `pnpm harness:check`                                     |

## Verification Commands

```bash
pnpm typecheck && pnpm lint
pnpm test -- feedback-form
pnpm harness:check
pnpm validate:docs
```

## Expected Output Summary

재현 테스트(완료 후 재진입 → 입력 폼) 추가 확인, 상태 리셋 구현 방식(컴포넌트 로컬 state 초기화 vs route 진입 시 reset), 기존 완료 화면 플로우 회귀 없음 확인, B1/B3 클러스터와의 근본원인 동일 여부 판단 결과를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? No.
2. Did this task introduce a new naming convention? No.
3. Did this task introduce a new dependency? No.
4. Did this task change verification commands? No.
5. Did this task reveal that the current harness instructions are outdated? No.
6. Should any `.agents/` document be updated? → yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- 모든 Acceptance Criteria green + `pnpm harness:check` 통과 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → 태스크 과대, split-work-packages 로 분할(05 §9.4).

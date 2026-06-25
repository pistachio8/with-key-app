---
Task: EVAL-0049
Track: greenfield
Kind: migration
Status: todo
Parent: docs/PRD.md
---

# EVAL-0049: 연속 인증 업로드 시 팝업 중복 표시 UX 개선

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0049` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: QA_TRIAGE.md B13 / feedback id `4b591e80` (2026-06-25) — TS SoT 없음, AT eval 흡수(05 §2 D10)
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/action-upload-popup-ux`

## Goal

하루에 챌린지 인증을 여러 번 업로드할 때 매 업로드마다 확인/완료 팝업이 반복 노출된다. 현재 팝업이 의도된 정책인지 PO·디자인 확인 후, 개선안(연속 업로드 시 팝업 1회로 축소 또는 toast 대체)을 합의해 구현한다.

## Source Files to Inspect

- `apps/web/src/app/(app)/challenge/[id]/action/_components/action-result-dialog.tsx` — 완료 팝업 컴포넌트
- `apps/web/src/app/(app)/challenge/[id]/action/_components/action-form.tsx` — 업로드 후 팝업 트리거 분기
- `apps/web/src/app/(app)/challenge/[id]/action/_components/action-form.spec.tsx` — 기존 폼 테스트
- `apps/web/src/app/(app)/challenge/[id]/action/_actions.ts` — Server Action 완료 응답 shape
- `docs/PRD.md` — §업로드 완료 UX 관련 AC(있는 경우) 확인

## Target Files

- `apps/web/src/app/(app)/challenge/[id]/action/_components/action-result-dialog.tsx` — 개선안 합의 후 수정
- `apps/web/src/app/(app)/challenge/[id]/action/_components/action-form.tsx` — 팝업 트리거 조건 수정(합의안에 따라)
- `apps/web/src/app/(app)/challenge/[id]/action/_components/action-form.spec.tsx` — 변경된 동작 반영 테스트 추가·수정

## Requirements

**선행 필수 — PO·디자인 합의**:

- 현재 매 업로드마다 팝업이 뜨는 동작이 **의도된 정책인지** 확인한다.
  - 의도된 정책이면: 개선안을 PO·디자인과 합의 후 진행. 무작정 제거 금지.
  - 버그(의도치 않은 반복)면: 정상 동작(1회 또는 toast) 정의 후 수정.
- 합의 없이 팝업을 임의 제거하지 않는다.

**합의 후 구현 범위 (안 A 또는 B 중 합의된 것)**:

- 안 A — 연속 업로드 시 팝업 1회만: 같은 세션에서 두 번째 업로드부터 팝업 생략.
- 안 B — 팝업 → toast 대체: 전체 업로드 완료를 toast로 피드백, 팝업 제거.
- 어떤 안이든: 기존 단일 업로드 완료 피드백이 제거되거나 무소식 상태가 되지 않아야 한다.

## Non-goals

- 업로드 자체 로직·Server Action DB 처리 변경
- 팝업 디자인 리뉴얼(합의 안에서 내용만 조정 가능)
- 인증 업로드 횟수 제한 정책 변경 — PRD/PO 소관

## Acceptance Criteria

| 기준                         | 검증 방법                                               |
| ---------------------------- | ------------------------------------------------------- |
| PO·디자인 합의 완료 기록     | Expected Output Summary 에 합의 내용 명시               |
| 개선된 동작(합의안) 구현     | 수동 확인: 연속 업로드 2회 시 팝업 횟수 또는 toast 확인 |
| 단일 업로드 완료 피드백 유지 | `pnpm test -- action-form` 기존 테스트 green            |
| TypeScript 컴파일 이상 없음  | `pnpm typecheck`                                        |
| ESLint 이상 없음             | `pnpm lint`                                             |
| harness 추적성               | `pnpm harness:check`                                    |

## Verification Commands

```bash
pnpm typecheck && pnpm lint
pnpm test -- action-form
pnpm harness:check
pnpm validate:docs
```

## Expected Output Summary

PO·디자인 합의 결과(의도된 정책 여부·채택된 안 A/B), 구현 방식(팝업 트리거 조건 조정 or toast 대체), 기존 단일 업로드 피드백 보존 확인, 합의 과정에서 정의된 정책 변경이 있으면 PRD 반영 필요 여부를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? No.
2. Did this task introduce a new naming convention? No.
3. Did this task introduce a new dependency? No.
4. Did this task change verification commands? No.
5. Did this task reveal that the current harness instructions are outdated? No.
6. Should any `.agents/` document be updated? → yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- PO·디자인 합의 완료 + 모든 Acceptance Criteria green + `pnpm harness:check` 통과 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → 태스크 과대, split-work-packages 로 분할(05 §9.4).
- 합의 미도달(정책 미확정) 시: Status 를 `blocked` + Blocked-by `[po:design-ux-decision] — 팝업 반복 정책 합의` 로 전환 후 대기.

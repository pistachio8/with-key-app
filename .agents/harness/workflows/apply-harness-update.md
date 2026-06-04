# Workflow: apply-harness-update

## Goal
승인된 proposal을 적용. Level 1은 자동 PR, Level 2는 사람 머지 후 CHANGELOG 기록.

## Read First
- 승인된 proposal · .agents/harness/UPDATE_POLICY.md · .agents/harness/CHANGELOG.md

## Inputs
- 승인된 proposal 1개

## Process
1. Level 1(경로명·script명·CHANGELOG·완료 task 상태·traceability 링크 보정) → 자동 PR.
2. Level 2 → 사람 머지 확인 후 적용.
3. CHANGELOG.md에 변경 1줄 추가(append-only).

## Output Format
적용 diff + CHANGELOG 엔트리.

## Stop Condition
- 변경 적용 + CHANGELOG 기록 + (weaken 시) reason-code 로그(evals/meta/).

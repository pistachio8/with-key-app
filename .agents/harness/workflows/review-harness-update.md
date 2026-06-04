# Workflow: review-harness-update

## Goal
update proposal을 사람이 검토해 머지/반려. meta-eval weaken은 ADR + PO 승인 강제.

## Read First
- 대상 proposal(.agents/harness/reports/proposals/) · .agents/harness/UPDATE_POLICY.md

## Inputs
- proposal 1개

## Process
1. Level 분류 확인(1/2/3).
2. meta-eval 결과 확인: weaken이면 reason-code + ADR + PO 승인 없으면 Block.
3. Level 3 항목이 섞였으면 반려 → DECISION_NEEDED.md.

## Output Format
검토 결과: merge | block(사유) | escalate(PO).

## Stop Condition
- weaken 0건이거나 전부 PO 승인됨 → merge 허용.

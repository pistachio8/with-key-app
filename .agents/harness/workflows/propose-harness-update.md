# Workflow: propose-harness-update

## Goal
drift report를 받아 update proposal(PR 초안) 생성. 승인 없이 적용 안 함(원칙 8).

## Read First
- 대상 drift report(evals/drift-reports/) · .agents/harness/UPDATE_POLICY.md

## Inputs
- drift 항목 1~N

## Process
1. 각 항목을 Level 1/2/3 분류(UPDATE_POLICY).
2. Level 1 → apply-harness-update 자동 PR 후보 표시.
3. Level 2 → 제안 + meta-eval 분류(strengthen/neutral/weaken).
   weaken이면 reason-code + ADR 필요 + auto-merge 차단.
4. Level 3 → 제안 금지, DECISION_NEEDED.md에 PO 항목 등록.
5. .agents/harness/reports/proposals/<date>-<slug>.md 로 저장.

## Output Format
proposal: {대상, Level, meta-eval 결과, diff 요약, 승인 필요자, reason-code(weaken 시)}.

## Stop Condition
- 모든 drift 항목이 proposal 또는 DECISION_NEEDED로 라우팅됨.

# Workflow: review-agent-task

## Goal
구현된 Agent Task를 머지 전 리뷰. CRITICAL/HIGH 없으면 Approve.

## Read First
- 대상 AT 파일 · 변경 diff · .agents/engineering/INDEX.md · (port면) .agents/migration/REVIEW_CHECKLIST.md · docs/QUALITY_GATE.md §리뷰 기준

## Inputs
- Agent Task 1개 + 그 변경 diff

## Process
1. QUALITY_GATE 리뷰 기준 적용(보안·RLS·경계·zod SoT·에러처리·범위).
2. port 트랙 → REVIEW_CHECKLIST 6항목 확인.
3. Acceptance Criteria green + Verification 통과 확인.
4. 심각도 분류(CRITICAL/HIGH/MEDIUM/LOW).

## Output Format
리뷰 결과: 심각도별 이슈 목록 + Approve/Block.

## Stop Condition
- CRITICAL/HIGH 0건 → Approve. 있으면 fix-verification로.
- Claude: /review 래퍼 · Codex: 이 파일을 읽고 따름.

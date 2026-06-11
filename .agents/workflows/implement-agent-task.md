# Workflow: implement-agent-task

## Goal

Agent Task 1개를 구현해 Acceptance Criteria를 green으로.

## Read First

- 핸드오프된 AT 파일 1개 (오직 1개 — Story·PRD 핸드오프 금지, D5)
- AT의 Source Files to Inspect · .agents/engineering/INDEX.md (코딩 규칙 포인터)

## Inputs

- Agent Task 1개

## Process

1. Source Files 읽어 컨텍스트 확보.
2. Target Files만 수정(Non-goals 봉인 — 무관 코드 안 건드림, surgical).
3. Requirements 구현.
4. Verification Commands 실행 → green 될 때까지(pass@3).
5. Harness Impact Questions 6개 답변. yes 있으면 evals/drift-reports/에 노트.
6. AC green 확정 → 대상 AT의 `Status: in_progress → done` 갱신, 같은 WP 브랜치에 커밋(PR 에 포함). 머지 후 별도 편집 금지 — status drift 원천 차단(PR 템플릿 Verification 정렬, 누락 시 `pnpm harness:drift` 가 경고).

## Output Format

변경 파일 목록 + Expected Output Summary + Harness Impact 답변 + Verify 결과.

## Stop Condition

- AT의 Stop Condition 충족. 3회 실패 시 분할 신호(create-agent-tasks 재호출).
- Claude: /implement-agent-task(.claude/commands 래퍼) · Codex: 이 파일을 읽고 따름.

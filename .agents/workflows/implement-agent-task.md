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
6. AC green 확정 → `pnpm harness:finalize <EVAL-ID>` 실행 — Status done flip + runs[] skeleton append + `pnpm harness:check` 를 한 명령으로 처리한다. placeholder 안내(exit 1)가 나오면 `evals/results/agent-results.json` 의 `summary`·`verification`(기존 관례 `{ "local": { "<명령>": "<결과>" } }`)을 채우고 `notes` 불요 시 필드를 삭제한 뒤 같은 명령을 재실행해 exit 0 을 확인한다. 결과는 같은 WP 브랜치에 커밋(PR 에 포함). 머지 후 별도 편집 금지 — status drift 원천 차단(PR 템플릿 Verification 정렬, 누락 시 `pnpm harness:drift` 가 경고).

## Output Format

변경 파일 목록 + Expected Output Summary + Harness Impact 답변 + Verify 결과.

## Stop Condition

- AT의 Stop Condition 충족. 3회 실패 시 분할 신호(create-agent-tasks 재호출).
- Claude: /implement-agent-task(.claude/commands 래퍼) · Codex: 이 파일을 읽고 따름.

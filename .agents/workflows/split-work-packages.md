# Workflow: split-work-packages

## Goal
Engineering Story → Work Package(1 worktree = 1 PR) 분해.

## Read First
- 대상 Engineering Story · .agents/backlog/WORK_PACKAGE_TEMPLATE.md · docs/migration/05-rn-harness-decisions.md §4

## Inputs
- Engineering Story 1개

## Process
1. 응집된 기능 슬라이스 = 1 Work Package = 브랜치 feat/rn-<feature>.
2. 각 WP에 포함될 Agent Task 후보 식별(create-agent-tasks 입력).
3. port/greenfield 비혼합(원칙 9) — 한 WP는 한 트랙.

## Output Format
WP-<feature> 목록(브랜치 · Track · 상위 ES · Agent Task 후보).

## Stop Condition
- ES의 모든 작업이 WP로 커버됨 + 각 WP가 단일 트랙.

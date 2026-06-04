# Workflow: create-agent-tasks

## Goal
Work Package 1개를 에이전트 1패스로 실행 가능한 Agent Task 1~N개로 분해.

## Read First
- .agents/README.md · .agents/backlog/AGENT_TASK_TEMPLATE.md
- .agents/migration/INDEX.md (port) 또는 .agents/engineering/INDEX.md (greenfield)
- 해당 Engineering Story (docs/eng-stories/) · 05 D2·D5

## Inputs
- Work Package 1개 (Engineering Story가 spawn) · 트랙 태그(port|greenfield)

## Process
1. WP를 레이어 슬라이스로 쪼갬(1 feature/api 또는 1 capability = 1 AT 휴리스틱).
2. **port/greenfield 비혼합**(원칙 9·D2) — 포팅 AT와 신기능 AT를 다른 파일로.
3. 각 AT에 Parent 5종·Non-goals·AC·Verify·Harness Impact Q 채움.
4. greenfield θ/G2 의존 AT는 Status: blocked + Blocked-by 명시(D12).
5. evals/tasks/NNNN-<slug>.md 로 저장(0004부터, append-only 번호).

## Output Format
evals/tasks/NNNN-*.md (AGENT_TASK_TEMPLATE 따름).

## Stop Condition
- WP의 모든 동작이 AT로 커버 + 각 AT가 Verify 가능 + 트랙 태그 100%.

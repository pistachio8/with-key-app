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
4. greenfield θ/G2 의존 AT는 Status: blocked + Blocked-by 명시(D12). Blocked-by·Depends-on 은 토큰 문법 — `[type:value] … — 자유 문장`(— 왼쪽 토큰만 기계가 읽음 · 타입 5종 task|gate|adr|spec|po · 키가 있으면 토큰 ≥1, `pnpm harness:check` 강제). 하드 게이트는 Blocked-by(Status blocked 동반), intra-feature 순서는 Depends-on(Status todo 가능 — 게이트로 표기하면 착수 가능한 일이 blocked 로 보인다). 첫 task: 토큰이 `harness:goal` worktree base 선행이 된다.
5. evals/tasks/NNNN-<slug>.md 로 저장(0004부터, append-only 번호).
6. 저장 후 `pnpm harness:goal <ID>` 로 /goal 실행 프롬프트를 파생 확인(SoT=AT 파일, 중복 0). **렌더 프롬프트 4000자 이하 필수** — /goal 의 goal condition 하드 리밋이라 초과 시 실행 자체가 거부된다. 초과하면 AT 를 더 잘게 분할하거나 본문을 줄인다(open task 초과는 `pnpm harness:check` 가 FAIL 로 잡는다). 별도 프롬프트 파일을 만들지 않는다 — 필요 시 `--write` 로 로컬 `evals/tasks/<id>.goal.md`(gitignored). 인자 없이 `pnpm harness:goal` 은 `*.goal.md` 미생성 task 를 일괄 생성.

## Output Format

evals/tasks/NNNN-\*.md (AGENT_TASK_TEMPLATE 따름). /goal 실행 프롬프트는 `pnpm harness:goal <ID>` 파생 뷰(별도 파일 SoT 없음).

## Stop Condition

- WP의 모든 동작이 AT로 커버 + 각 AT가 Verify 가능 + 트랙 태그 100% + 각 AT의 /goal 프롬프트 ≤ 4000자.

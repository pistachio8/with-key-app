# .agents/ — AI 하네스 머시너리 (tool-agnostic 진입점)

> 머시너리 = 하네스를 _돌리는_ 것(템플릿·워크플로·정책). 인스턴스 = 하네스가 _만든_ 것(`docs/`·`evals/`). Codex·Claude·Cursor 공통 진입점. (ADR-0031)

## 한 줄

PWA→RN 전환 하네스. 제품(pm) → 분해 spine → Agent Task(`evals/tasks`) → 검증(`pnpm harness:*`) → 자기유지(harness).

## 작업 종류 → workflow 매핑

| 작업              | workflow                                                                           |
| ----------------- | ---------------------------------------------------------------------------------- |
| PRD 생성/정규화   | [workflows/create-prd.md](workflows/create-prd.md)                                 |
| Test Scenario     | [workflows/create-test-scenarios.md](workflows/create-test-scenarios.md)           |
| Job Story         | [workflows/create-job-stories.md](workflows/create-job-stories.md)                 |
| Engineering Story | [workflows/create-engineering-stories.md](workflows/create-engineering-stories.md) |
| Work Package 분해 | [workflows/split-work-packages.md](workflows/split-work-packages.md)               |
| Agent Task 분해   | [workflows/create-agent-tasks.md](workflows/create-agent-tasks.md)                 |
| Agent Task 구현   | [workflows/implement-agent-task.md](workflows/implement-agent-task.md)             |
| 리뷰              | [workflows/review-agent-task.md](workflows/review-agent-task.md)                   |
| 검증 수정         | [workflows/fix-verification.md](workflows/fix-verification.md)                     |

## 디렉토리

- `pm/` — 제품 맥락·템플릿·PM adapter: [pm/PM_PLUGIN_ADAPTER.md](pm/PM_PLUGIN_ADAPTER.md) · [pm/PRODUCT_CONTEXT.md](pm/PRODUCT_CONTEXT.md)
- 규칙 포인터(본문 복제 금지): [engineering/INDEX.md](engineering/INDEX.md) · [migration/INDEX.md](migration/INDEX.md)
- `backlog/` — Work Package·Agent Task 템플릿·Traceability
- `qa/` — dogfood QA·release 체크리스트
- `workflows/` — 도구 중립 절차 SoT(9)
- 자기유지(정책·drift·changelog·config): [harness/HARNESS_MAINTENANCE.md](harness/HARNESS_MAINTENANCE.md)

## 검증 (도구 무관 CLI)

- `pnpm harness:context <task-id>` — 구현 전 컨텍스트 번들
- `pnpm harness:goal <task-id>` — AT 1개에서 /goal 실행 프롬프트 파생(`--write` 로 로컬 `*.goal.md`)
- `pnpm harness:summarize-diff` — 구현 후 Task Summary
- `pnpm harness:check` — 결정론 Tier 1 추적성·구조 lint
- `pnpm harness:drift` — 7 drift 점검 → drift report
- `pnpm harness:verify` — typecheck · lint · test · check

> 현재 `harness:*`는 skeleton(spec §8) — 실제 검증 로직은 후속 코드 단계에서 채운다.

## 인스턴스 홈

- PRD: `docs/PRD.md` · `docs/migration/01-rn-mvp-prd.md`
- Job Story: `docs/stories/` · Engineering Story: `docs/eng-stories/`
- PM 정규화(greenfield): `docs/pm/` — prd·job-stories·test-scenarios·acceptance-criteria·risks-assumptions. port 트랙은 `docs/PRD.md`·`docs/stories/` 재사용(신규 파일 없음)
- Agent Task: `evals/tasks/` · 결과: `evals/results/`
- 결정: `docs/adr/` · `docs/superpowers/specs/`

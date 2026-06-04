# evals/

with-key 의 **AI agent eval harness**. 같은 task를 여러 agent / 모델 / 시점에 돌려 1-shot 성공률을 추적한다.

## Purpose / 역할

agent 코드베이스 변경 → 점수 회귀를 catch하는 게이트. AI-Ready 루브릭 G 카테고리(성과 측정 인프라)와 E4(prompt test)의 본체.

## Owns / 디렉터리 구조

- `tasks/` — 베이스라인 task 정의 (1 task = 1 markdown). 명세 + pass criteria + 평가 자동화 가능 여부.
- `results/` — 측정 결과 누적. `agent-results.json` 형식. 시점별 누적, 덮어쓰지 않음.

## Patterns / How to run

현재는 **manual baseline** 단계 (자동 harness는 후속 PR에서 도입):

```bash
# 1. 새 agent 세션 시작 (Claude Code · Codex · Cursor 등)
# 2. tasks/<NNNN-*.md> 의 prompt 섹션을 그대로 복사해서 agent에 입력
# 3. 통과/실패 + 1-shot 여부를 results/agent-results.json 의 runs[] 에 append
# 4. 회귀 발생 시 Decision은 docs/adr/ 에 기록
```

## Gotcha

- **TBD baseline**: 현재 task 3건 모두 `pending` — 실제 baseline run은 별도 세션에서 수행 필요.
- task spec은 한 번 정하면 비교 가능성을 위해 **수정 금지**. 새 task가 필요하면 `0002-`, `0003-` 으로 추가.
- prompt에 시크릿(API 키, supabase secret) 포함 금지.

## RN 하네스 task (0004+) frontmatter 확장

ADR-0031 / spec `2026-06-04-harness-mvp-file-structure-design`에 따라 **0004번부터** frontmatter를 확장한다. 0001~0003은 grandfather(소급 변경 없음 — 비교 가능성 보존).

스키마 SoT: [`../.agents/backlog/AGENT_TASK_TEMPLATE.md`](../.agents/backlog/AGENT_TASK_TEMPLATE.md).

- `Track`: port | greenfield (D2 — 보존 eval 적용 여부)
- `Kind`: migration | regression (migration=닫히는 work-unit / regression=영속 baseline)
- `Parent`: spine 인용(PRD AC → ... → Agent Task)
- `Status`: todo | blocked | in_progress | done
- `Blocked-by`: blocked일 때 해제 조건(예: G1-PoC θ 확정)

drift 리포트는 [`drift-reports/`](drift-reports/)에 append-only 누적된다.

## See also / Cross-module dependencies

- 결정 이력: [`../docs/adr/`](../docs/adr/) (회귀 catch 시 ADR 한 건 추가)
- 일상 결정: [`../docs/TEAM_SHARE_DECISIONS.md`](../docs/TEAM_SHARE_DECISIONS.md)
- 품질 게이트 (검증 의무): [`../docs/QUALITY_GATE.md`](../docs/QUALITY_GATE.md)

# Harness Changelog (append-only)

> 하네스 머시너리 변경 이력. 모든 harness workflow가 변경 시 1줄 추가한다.

## 0.2 — 2026-06-05

- `harness:check` 실구현 (skeleton → 결정론 Tier 1 lint, spec §4.6 계약). `evals/tasks/*.md` frontmatter 파싱 → Track·Status 검증 + Parent 인용 경로 resolve(hallucinated-path 검출). 0001~0003 grandfather skip, 0004+ frontmatter 필수(evals/README §33). `scripts/harness-check.spec.mjs` 단위 테스트 14건 동반.

## 0.1 — 2026-06-04

- 하네스 MVP 파일 구조 scaffold (spec `2026-06-04-harness-mvp-file-structure-design` · ADR-0031).
- `.agents/{pm,engineering,migration,backlog,qa,workflows,harness}` + `docs/eng-stories` + `evals/{drift-reports,meta}` 생성.
- `harness:{check,drift,summarize-diff,context,verify}` 스크립트 wire-up (skeleton — 실제 구현은 후속 코드 단계, spec §8).
- 정규화 PM 인스턴스 홈을 `.agents/pm/*` → `docs/pm/*`로 이동 (DECISION_NEEDED `PM-INSTANCE-HOME` 방향 A, ADR-0031 §1 정합). `PM_PLUGIN_ADAPTER`·`create-prd`·`create-test-scenarios`·`.agents/README` 정정, `docs/pm/` 신설. raw는 머시너리 유지, spec·plan은 supersede 기록만.

# Harness Changelog (append-only)

> 하네스 머시너리 변경 이력. 모든 harness workflow가 변경 시 1줄 추가한다.

## 0.3 — 2026-06-05

- G1-θ false-flag 임계 θ **잠정확정·주입**(PO conservative): `config/harness.config.example.json` `false_flag_rate.theta=0.01`·`judge`(phash 해밍 6/10 · EXIF/스크린샷 단독 차단 안 함) 주입, `active=false` 유지(실측 G1 PoC open). EVAL-0022 `blocked→todo` 활성(`Blocked-by`→`Depends-on`, intra-feature 순서·게이트 아님). spec `2026-06-05-false-flag-threshold-theta` 신설, PRD §7 Q1·DECISION_NEEDED `G1-θ`(partial) 동기. meta-eval=**neutral**(임계 주입·게이트 미flip — active threshold 약화 아님).
- PM job-stories 출력처 편차 정정: `docs/pm/job-stories.md` → `docs/stories/`(spine 홈, 05 §2 D10). PM-INSTANCE-HOME 방향 A 의 과잉적용(job-stories 를 `docs/pm/`에 둠) 수정 — 방향 A 가 새 `docs/` 홈을 부여한 대상은 test-scenarios·AC·risks 뿐, job-stories 는 D10 `docs/stories/` 기존 홈 보유. P1 파일 이동 + `PM_PLUGIN_ADAPTER`·`.agents/README`·eng-story/prd 역링크 정정. test-scenarios·AC·risks·prd-index 는 `docs/pm/` 유지. meta-eval=**neutral**(relocation). 후속: P2 job-stories 는 `docs/stories/`로 normalize. (DECISION_NEEDED `PM-INSTANCE-HOME` 정정 항목)

## 0.2 — 2026-06-05

- `harness:{check,context,drift,summarize-diff}` skeleton → 결정론 Tier 1 실구현. `harness-lib.mjs` 가 frontmatter·추적성 검증 SoT(`validateTask`)를 제공하고 check·context·drift 가 공유한다. 0001~0003 grandfather, 0004+ 필수(evals/README §33).
- 검증 견고성 보강(흡수): frontmatter BOM·주석 라인·인라인 주석 처리, 헤딩 부가 텍스트(`## Parent Links (…)`) 매칭, 경로 추출 시 템플릿 placeholder(`<…>`·`…`·글롭) 제외. Task 형식은 템플릿 SoT 의 번호형(`EVAL-0004`)·슬러그형(`EVAL-<feature>-<slug>`)을 둘 다 허용.
- `scripts/harness-lib.spec.mjs` node:test 단위 22건 추가 (`pnpm harness:test` · `harness:verify` 체인에 연결).

## 0.1 — 2026-06-04

- 하네스 MVP 파일 구조 scaffold (spec `2026-06-04-harness-mvp-file-structure-design` · ADR-0031).
- `.agents/{pm,engineering,migration,backlog,qa,workflows,harness}` + `docs/eng-stories` + `evals/{drift-reports,meta}` 생성.
- `harness:{check,drift,summarize-diff,context,verify}` 스크립트 wire-up (skeleton — 실제 구현은 후속 코드 단계, spec §8).
- 정규화 PM 인스턴스 홈을 `.agents/pm/*` → `docs/pm/*`로 이동 (DECISION_NEEDED `PM-INSTANCE-HOME` 방향 A, ADR-0031 §1 정합). `PM_PLUGIN_ADAPTER`·`create-prd`·`create-test-scenarios`·`.agents/README` 정정, `docs/pm/` 신설. raw는 머시너리 유지, spec·plan은 supersede 기록만.

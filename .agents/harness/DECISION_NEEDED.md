# Decision Needed (PO 대기 결정 — append-only)

> 하네스가 자율 결정할 수 없는 Level 3 항목을 깃발만 꽂는 로그(`UPDATE_POLICY.md`). 해소는 PO. propose-harness-update가 등록한다. 각 항목: {id · 차단 task · 해소 조건 · 상태}.

## 항목

- **G1-θ**: false-flag 임계 θ 미확정.
  - 차단: P2 부정탐지 Agent Task.
  - 해소 조건: G1 PoC 완료 + θ 주입(`docs/migration/01-rn-mvp-prd.md` §7 Q1).
  - 상태: open.
- **G2-legal**: 법무 검토 미완.
  - 차단: P1/P2 정산 기능 배포.
  - 해소 조건: 법무 통과 → boolean 게이트 flip(`docs/migration/01-rn-mvp-prd.md` §7 Q2).
  - 상태: open.
- **04-§9-UX**: invite re-tap UX 수용 vs Branch / Bottom Tabs 새 IA 승인.
  - 차단: 신규 IA Agent Task.
  - 해소 조건: PO 결정 + screenshot acceptance(`docs/migration/04-rn-architecture.md` §9).
  - 상태: open.
- **PM-INSTANCE-HOME**: 정규화 PM 산출물(`.agents/pm/{prd,job-stories,test-scenarios,acceptance-criteria,risks-assumptions}.md`)이 ADR-0031 §1(인스턴스→`docs/`·`evals/`, 머시너리 `.agents/pm`엔 templates·raw·adapter만)과 충돌. `PM_PLUGIN_ADAPTER.md`·`workflows/create-prd.md`·`workflows/create-test-scenarios.md` + plan/spec이 인스턴스를 머시너리 트리로 출력하도록 명시. 인스턴스 아직 미생성 = 무비용 정정 시점.
  - 차단: 첫 PM-plugin/greenfield normalize 실행.
  - 해소 조건: PO 방향 택1 — **(A·권장)** 출력처를 `docs/`로 이동해 ADR-0031에 정합(greenfield test-scenarios·acceptance-criteria·risks-assumptions의 `docs/` 홈 신규 정의 + README 인스턴스 홈 갱신, PM_PLUGIN_ADAPTER·create-prd·create-test-scenarios·plan·spec 경로 교정) / **(B)** ADR-0031 개정으로 `.agents/pm/` 정규화 staging을 의도적 예외로 명문화(meta-eval weaken: `SOT_PRECEDENCE_RELAXED`).
  - 상태: resolved (2026-06-04, PO 방향 A) — `docs/pm/` 신설 + `PM_PLUGIN_ADAPTER`·`create-prd`·`create-test-scenarios`·`.agents/README` 정정. raw는 `.agents/pm/raw/` 머시너리 유지(ADR-0031 후속영향 #2). plan·spec은 동일 날짜 설계 기록이라 소급 재작성 대신 본 항목·CHANGELOG로 supersede(ADR-0031 §1 상위 SoT).

읽는 workflow: propose-harness-update.
업데이트 시점: 미결정 추가/해소 시.

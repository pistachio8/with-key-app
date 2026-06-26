# Decision Needed (PO 대기 결정 — append-only)

> 하네스가 자율 결정할 수 없는 Level 3 항목을 깃발만 꽂는 로그(`UPDATE_POLICY.md`). 해소는 PO. propose-harness-update가 등록한다. 각 항목: {id · 차단 task · 해소 조건 · 상태}.

## 항목

- **G1-θ**: false-flag 임계 θ.
  - 차단: P2 부정탐지 판정 Agent Task(EVAL-0022).
  - 해소 조건: G1 PoC 완료 + θ 주입(`docs/migration/01-rn-mvp-prd.md` §7 Q1).
  - 상태: partial (2026-06-05, PO) — **θ 잠정확정·주입**(conservative: θ_rate ≤ 1% · phash 해밍 ≤6 → failed[동일-user/group; 전역 제외] · EXIF/스크린샷 단독 차단 안 함 · shadow mode[`VERIFY_ENFORCE=false`]). config(`false_flag_rate.theta`·`judge`)·spec·PRD §7 Q1 동기, EVAL-0022 blocked→todo 활성. **실측 G1 PoC는 open** → `false_flag_rate.active=false` 유지(PoC 통과 시 flip + resolved). spec: `docs/superpowers/specs/2026-06-05-false-flag-threshold-theta.md`.
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
  - 정정: 2026-06-05 (PO 편차정정) — 방향 A 의 job-stories 출력처가 `docs/pm/job-stories.md`로 **과잉적용**된 편차 수정. 방향 A 가 새 `docs/` 홈을 정의한 대상은 test-scenarios·AC·risks 뿐(job-stories·prd 는 기존 홈 보유); job-stories spine 홈 = `docs/stories/`(05 §2 D10 · `create-job-stories` · eng-stories README 와 이미 정합). P1 `docs/pm/job-stories.md` → `docs/stories/2026-06-05-p1-settlement-job-stories.md` 이동 + `PM_PLUGIN_ADAPTER`·`.agents/README`·eng-story/prd 역링크 정정. test-scenarios·AC·risks·prd-index 는 `docs/pm/` 유지(무충돌). meta-eval=**neutral**(relocation·정합 복원, weaken 아님).

- **ADR-0042-ACCEPT**: 실행 기질 ADR proposed→accepted 승격 (하네스 자율 경계 결정).
  - 차단: `headless-substrate`/`parallel-implementer` 전환 spec 착수 — 방향이 accepted 여야 다운스트림 전부의 prerequisite 가 성립.
  - 해소 조건: PO 가 meta-eval **weaken(`AUTONOMY_EXPANDED`, 첫 실사용 — ×3 침식 아님)** 승인 → 사람이 ADR Status 플립(D6). proposal: `.agents/harness/reports/proposals/2026-06-26-adr-0042-accept.md`. ADR: `docs/adr/0042-harness-execution-substrate-process-vs-inline.md`.
  - 상태: **resolved (2026-06-26, PO 승인)** — weaken(`AUTONOMY_EXPANDED`) 분류 승인 + ADR Status `proposed`→`accepted` 플립. accepted 범위는 *방향·제약*뿐, 헤드리스 전환 착수는 별도 spec + 새 `AUTONOMY_EXPANDED` meta-eval + PO 게이트(G1~G6 닫기) 재필요 — 본 해소와 분리.

읽는 workflow: propose-harness-update.
업데이트 시점: 미결정 추가/해소 시.

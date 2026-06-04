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

읽는 workflow: propose-harness-update.
업데이트 시점: 미결정 추가/해소 시.

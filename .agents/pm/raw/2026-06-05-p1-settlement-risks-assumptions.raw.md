# [RAW] P1 포인트 보증금 정산 — Risks & Assumptions

Source: pm-product-discovery:identify-assumptions-existing 2026-06-05
Feature: P1 포인트 보증금 정산 (fromwith RN MVP)
PRD SoT: docs/migration/01-rn-mvp-prd.md §5.C·§7
형식: 4축(Value/Usability/Viability/Feasibility) 위험 가정 + 각 항목 impact·mitigation·confidence·test.

> raw 초안. normalize 시 표준 헤더 주입 → docs/pm/risks-assumptions.md. create-agent-tasks의 blocked-by(G1/G2) 입력.

---

## Value — 가치가 실제로 생기는가

### RA-V1 — closed-loop(현금화 불가) 포인트로도 손실회피 압박이 생긴다

- **위험**: 현금이 아니면 동기가 약해 V1(포인트 동기 효과)이 안 나온다.
- **confidence**: Medium
- **test**: V1 fake-door / A/B — 포인트 그룹 vs 비포인트 그룹 완주율(PRD §3 V1).
- **impact**: P1 핵심 가치 붕괴(연출 → 실제 손실회피 전환 실패).
- **mitigation**: V1 선행 검증, 초기 그랜트·게이지(AC-deposit-gauge)로 체감 강화.

### RA-V2 — 미달분 공동주머니 이월이 달성자에게 충분한 보상감을 준다

- **위험**: 미달분이 내 손에 안 들어와 허탈 → 재참여 동기 약화(개인 재분배 미채택의 비용).
- **confidence**: Medium
- **test**: 정산 후 재참여율·인터뷰(V3).
- **impact**: V2/V3 약화.
- **mitigation**: "우리 그룹 다음 밑천" 내러티브 + 다음 보증금 자동 충당 가시화.

## Usability — 사용자가 이해하고 쓰는가

### RA-U1 — hold·forfeit·이월 개념을 일반 사용자가 오해 없이 이해한다

- **위험**: "내 포인트 어디 갔냐" 혼란 → 분쟁·신뢰 하락.
- **confidence**: Low–Medium
- **test**: 게이지/정산 화면 사용성 테스트, 첫 정산 후 문의량.
- **impact**: 신뢰 하락, 분쟁 증가(V2 정산 분쟁).
- **mitigation**: 게이지 명확 고지(AC-deposit-gauge-2), 정산 스냅샷 내역 화면, 온보딩 설명.

### RA-U2 — 잔액 부족 시 서약 차단이 이탈을 부르지 않는다

- **위험**: 첫 진입 마찰 → 신규 드롭.
- **confidence**: Medium
- **test**: 서약 차단 발생률·이탈률.
- **impact**: 신규 활성 하락.
- **mitigation**: 신규 초기 그랜트(AC-deposit-hold-4)로 첫 서약 보장.

## Viability — 사업·법무가 받쳐주는가

### RA-Vi1 [G2] — ⓑ적립/번들 포인트가 환불의무·사행성·선불전자지급수단 규제에서 ≈0 리스크다

- **위험**: 법무 NO → P1 배포 불가.
- **confidence**: Medium (G2 미통과 — BLOCKING)
- **test**: G2 법무 검토(§0 BLOCKING).
- **impact**: P1 전체 차단.
- **mitigation**: G2 게이트 선행, 현금충전은 Fast-follow로 분리, 현금화 경로 원천 차단(AC-settle-3).

### RA-Vi2 [Q2] — 탈퇴자·환불 정책이 분쟁 없이 운영 가능하다

- **위험**: 중도 탈퇴자 잠긴 보증금 처리 모호 → CS/법적 리스크.
- **confidence**: Low (Q2 미해결)
- **test**: Q2 정책 확정 + 약관 고지.
- **impact**: 운영 리스크.
- **mitigation**: Q2(법무+PO) 확정 전 해당 경로 비활성, 정책 사전 고지.

### RA-Vi3 — 0% rake가 지속 가능하다(수익은 구독)

- **위험**: 포인트 운영비 대비 수익 모델 미검증.
- **confidence**: Medium
- **test**: startup-canvas 구독 WTP(범위 밖).
- **impact**: 장기 사업성.
- **mitigation**: 구독 모델 별도 검증(P1 범위 밖, 참고만).

## Feasibility — 기술로 지을 수 있는가

### RA-F1 [불변식·게이트 무관] — append-only 원장 + RPC-only write로 동시성·이중정산을 결정론적으로 막는다

- **위험**: race로 잔액 깨짐·이중 정산.
- **confidence**: High (ADR-0032 설계)
- **test**: idempotency·잔액=Σdelta 정합 테스트(즉시 활성, 게이트 무관).
- **impact**: 금전 정합 붕괴.
- **mitigation**: `settlements` PK=challenge_id + ON CONFLICT no-op, 잔액=Σdelta(ADR-0032).

### RA-F2 — 미달분 주 단위 누적(confirmedPenalty)이 조기종료·이의제기 변동과 정합한다

- **위험**: cutoff·doneCount 변동 시 오정산.
- **confidence**: Medium
- **test**: weekly-penalty-accrual + ADR-0030 cutoff 단위 테스트, doneCount 변동(TS-settle-trigger-3).
- **impact**: 정산 분쟁.
- **mitigation**: 48h 이의 마감 후 확정 + 재계산 경로.

### RA-F3 — auto-settle cron(72h)이 신뢰성 있게 동작한다

- **위험**: cron 누락/중복 → 미정산 또는 이중 정산.
- **confidence**: Medium
- **test**: cron + idempotency 통합 테스트.
- **impact**: V2 정산 완료율.
- **mitigation**: idempotency로 중복 무해(RA-F1), cron 모니터링.

---

## 게이트·Open Q 매핑 (create-agent-tasks blocked-by 입력)

- G1 = P2 false-flag 임계(P1 직접 의존 아님 — settle-trigger가 peer-reject(P2) 48h 마감에 간접 의존).
- **G2 = P1 전 기능 blocked-by** (RA-Vi1). Q2(RA-Vi2)는 G2 묶음.
- 즉시 활성(게이트 무관): RA-F1 불변식(AC-deposit-hold-5·AC-settle-trigger-3).

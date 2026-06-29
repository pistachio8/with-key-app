---
risks-assumptions: 2026-06-05-p1-settlement
title: P1 포인트 보증금 정산 — Risks & Assumptions
author: pistachio8
date: 2026-06-05
status: draft
---

# Risks & Assumptions: P1 포인트 보증금 정산

> 4축(Value/Usability/Viability/Feasibility) 위험 가정 + 각 항목 impact·mitigation. create-agent-tasks의 `Status: blocked`·`Blocked-by` 입력.
> Source: pm-product-discovery:identify-assumptions-existing (Plugin Mode normalize 2026-06-05, raw: `.agents/pm/raw/2026-06-05-p1-settlement-risks-assumptions.raw.md`).

## Value

- **RA-V1** — closed-loop(현금화 불가) 포인트로도 손실회피 압박이 생긴다. confidence Medium · test V1 A/B(완주율) · **impact** P1 가치 붕괴 · **mitigation** V1 선행 검증, 초기 그랜트·게이지로 체감 강화.
- **RA-V2** — 미달분 공동주머니 이월이 달성자에게 충분한 보상감을 준다. confidence Medium · test 재참여율·인터뷰 · **impact** V2/V3 약화 · **mitigation** "다음 밑천" 내러티브 + 충당 가시화.

## Usability

- **RA-U1** — hold·forfeit·이월 개념을 사용자가 오해 없이 이해한다. confidence Low–Medium · test 사용성 테스트·문의량 · **impact** 신뢰 하락·분쟁 · **mitigation** 게이지 고지(AC-deposit-gauge-2)·정산 내역 화면·온보딩.
- **RA-U2** — 잔액 부족 시 서약 차단이 이탈을 부르지 않는다. confidence Medium · test 차단율·이탈률 · **impact** 신규 활성 하락 · **mitigation** 신규 초기 그랜트(AC-deposit-hold-4).

## Viability

- **RA-Vi1 [G2]** — ⓑ적립/번들 포인트가 환불·사행성·선불전자지급수단 규제에서 ≈0 리스크다. confidence Medium(미통과·BLOCKING) · test G2 법무 검토 · **impact** P1 전체 차단 · **mitigation** G2 선행, 현금충전 Fast-follow 분리, 현금화 차단(AC-settle-3).
- **RA-Vi2 [Q2]** — 탈퇴자·환불 정책이 분쟁 없이 운영 가능하다. confidence Medium(PO 정책 확정 [ADR-0043], 법무 사인오프·약관 잔여) · test Q2 확정+약관 · **impact** 운영·법적 리스크 · **mitigation** Q2 확정 전 경로 비활성, 정책 고지(ADR-0043 DP4).
- **RA-Vi3** — 0% rake가 지속 가능하다(수익=구독). confidence Medium · test 구독 WTP(범위 밖) · **impact** 장기 사업성 · **mitigation** 구독 모델 별도 검증.

## Feasibility

- **RA-F1 ✱** — append-only 원장 + RPC-only write로 동시성·이중정산을 결정론적으로 막는다. confidence High(ADR-0032) · test idempotency·Σdelta 정합(즉시) · **impact** 금전 정합 붕괴 · **mitigation** settlements PK=challenge_id + ON CONFLICT no-op, 잔액=Σdelta.
- **RA-F2** — 미달분 주 단위 누적이 조기종료·이의제기 변동과 정합한다. confidence Medium · test weekly-penalty-accrual + ADR-0030 cutoff 단위 테스트 · **impact** 정산 분쟁 · **mitigation** 48h 마감 후 확정 + 재계산.
- **RA-F3** — auto-settle cron(72h)이 신뢰성 있게 동작한다. confidence Medium · test cron + idempotency 통합 · **impact** V2 정산 완료율 · **mitigation** idempotency로 중복 무해(RA-F1), 모니터링.

---

## 게이트 매핑 (create-agent-tasks blocked-by 입력)

- **G2 = P1 전 기능 blocked-by** (RA-Vi1). Q2(RA-Vi2)는 G2 묶음.
- G1(P2 false-flag)은 P1 직접 의존 아님 — `AC-settle-trigger-*`가 peer-reject(P2) 48h 마감에 간접 의존.
- **즉시 활성(게이트 무관)**: RA-F1(✱) 불변식 = `AC-deposit-hold-5`·`AC-settle-trigger-3` ([ADR-0032](../adr/0032-settlement-verification-data-model.md)).

## 용어집

- **leap-of-faith / 게이트**: 틀리면 기능 전체가 무너지는 핵심 가정. G1·G2가 이를 검증(05 §3).
- **✱ 불변식**: 게이트와 무관하게 즉시 강제·테스트되는 결정론 규칙(원장 잔액=Σdelta, 정산 idempotency).

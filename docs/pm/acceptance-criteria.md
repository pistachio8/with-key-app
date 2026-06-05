---
acceptance-criteria: 2026-06-05-p1-settlement
title: P1 포인트 보증금 정산 — Acceptance Criteria
author: pistachio8
date: 2026-06-05
status: draft
---

# Acceptance Criteria: P1 포인트 보증금 정산

> pass/fail 판정 가능한 수용 기준. 결정론 우선. **측정 기준의 SoT는 [PRD §5.C](../migration/01-rn-mvp-prd.md)** — 이 파일은 Agent Task eval 수용기준의 입력으로 ID·검증법을 정리한다.
> Track: **greenfield** · blocked-by **G2**(법무). 불변식(✱)은 게이트 무관 즉시 활성.

## deposit-hold (← `PRD-AC-deposit-hold-*`)

- [ ] `AC-deposit-hold-1` — 서약 시 보증금이 적립/번들 잔액에서 hold(현금 충전 아님) · 검증: [TS-deposit-hold-1](./test-scenarios.md)
- [ ] `AC-deposit-hold-2` — hold 금액 = 챌린지 최대 누적 벌금(Σ 전체 주 × penaltyAmount) · 검증: TS-deposit-hold-1
- [ ] `AC-deposit-hold-3` — 그룹 이월 풀이 있으면 풀을 공동 스테이크로 깔고 참가자 N명 균등 차감 · 검증: TS-deposit-hold-4
- [ ] `AC-deposit-hold-4` — 잔액 부족 시 서약 차단 + 신규 유저 초기 그랜트(bundle_grant)로 첫 서약 가능 · 검증: TS-deposit-hold-2·3
- [ ] `AC-deposit-hold-5` ✱ — hold/해제가 append-only 원장에 기록, **잔액 = Σdelta** · 검증: TS-deposit-hold-5 (게이트 무관)

## deposit-gauge (← `PRD-AC-deposit-gauge-*`)

- [ ] `AC-deposit-gauge-1` — 보증금 잔액 게이지 + 미달 시 차감 예정액 표시 · 검증: TS-deposit-gauge-1
- [ ] `AC-deposit-gauge-2` — "표시만"이 아니라 종료 시 실제 이동됨을 명확히 고지 · 검증: TS-deposit-gauge-1
- [ ] `AC-deposit-gauge-3` — 신규 포인트 잔액 조회 이벤트 발생 · 검증: 이벤트 로그(`points_balance_view`)

## settle (← `PRD-AC-settle-*`)

- [ ] `AC-settle-1` — 달성자 본인 보증금 전액 환급(원금 한도), 미달분은 그룹 공동 주머니 → 다음 챌린지 이월 · 검증: TS-settle-1
- [ ] `AC-settle-2` — 풀은 그룹 생존 중 무기한 보관, 그룹 삭제 시에만 소멸 · 검증: 그룹 삭제 시나리오
- [ ] `AC-settle-3` — 회식·장비·기부·현금환급 등 현금 용도 제외(앱 내 이월만) · 검증: TS-settle-3
- [ ] `AC-settle-4` — 미달분 산정 = 주 단위 누적(`confirmedPenalty`), binary 아님 · 검증: TS-settle-2
- [ ] `AC-settle-5` — 분배 규칙은 챌린지 시작 시 고정(재량 분배 아님) · 검증: 정산 스냅샷 대조
- [ ] `AC-settle-6` — 개인 재분배 방식 미채택(도박 위험) · 검증: TS-settle-1(재분배 0행)
- [ ] `AC-settle-7` — 모든 이동 원장 append + 정산 스냅샷 저장 · 검증: TS-settle-4

## settle-trigger (← `PRD-AC-settle-trigger-*`)

- [ ] `AC-settle-trigger-1` — 그룹장 종료 화면 "정산 확정" 트리거(확정만, 재량 분배 아님) · 검증: TS-settle-trigger-1
- [ ] `AC-settle-trigger-2` — 이의·반려 마감 48h → 그룹장 수동 그 전 언제든 → 72h cron auto-settle · 검증: TS-settle-trigger-1
- [ ] `AC-settle-trigger-3` ✱ — 이중 정산 방지(원장 idempotency·정합성) · 검증: TS-settle-trigger-2 (게이트 무관)
- [ ] `AC-settle-trigger-4` — `settlement_triggered`/`settlement_auto` 이벤트 발생 · 검증: 이벤트 로그

## points-use (← `PRD-AC-points-use-*`)

- [ ] `AC-points-use-1` — 포인트 closed-loop 적립, 현금화 불가 · 검증: TS-points-use-1
- [ ] `AC-points-use-2` — 용도: 다음 챌린지 보증금 · (Later) 구독 할인 · 앱 내 보상 · 검증: TS-points-use-2
- [ ] `AC-points-use-3` — 잔액·이력 조회 화면 · 검증: 화면 수동 확인

---

> ✱ = 결정론 불변식(05 §3, [ADR-0032](../adr/0032-settlement-verification-data-model.md)) — G2 게이트 전에도 즉시 테스트.

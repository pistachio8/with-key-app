---
test-scenario: 2026-06-05-p1-settlement
title: P1 포인트 보증금 정산 — Test Scenarios
author: pistachio8
date: 2026-06-05
status: draft
---

# Test Scenarios: P1 포인트 보증금 정산

> Given / When / Then + expected(결정론 우선). PRD AC와 1:1. **최종 SoT는 Agent Task eval 수용기준**(D10) — 이 파일은 작성 보조.
> Source: pm-execution:test-scenarios (Plugin Mode normalize 2026-06-05, raw: `.agents/pm/raw/2026-06-05-p1-settlement-test-scenarios.raw.md`).

## Parent / Track

- PRD: [docs/migration/01-rn-mvp-prd.md](../migration/01-rn-mvp-prd.md) §5.C · 데이터: [ADR-0032](../adr/0032-settlement-verification-data-model.md)
- Track: **greenfield** · blocked-by **G2** — 단 `TS-deposit-hold-5`·`TS-settle-trigger-2`(불변식)는 즉시 활성.

---

### TS-deposit-hold-1 (← AC-deposit-hold-1·2) — 서약 시 hold = 최대 누적 벌금

- **Given** 적립 잔액 5000P, 챌린지 최대 누적 벌금 3000P · **When** 서약 · **Then** hold
- **expected**: 원장 `delta=-3000, reason=deposit_hold` 1행, 가용 잔액 2000P

### TS-deposit-hold-2 (← AC-deposit-hold-4) — 잔액 부족 시 서약 차단

- **Given** 잔액 1000P, 필요 3000P · **When** 서약 시도 · **Then** 차단
- **expected**: 서약 거부 + 부족액 2000P 고지, 원장 변화 0행

### TS-deposit-hold-3 (← AC-deposit-hold-4) — 신규 유저 초기 그랜트

- **Given** 가입 직후 잔액 0P, hold 1000P · **When** 첫 서약 · **Then** 그랜트 후 hold
- **expected**: `delta=+1000 bundle_grant` → `delta=-1000 deposit_hold`, 잔액 0P

### TS-deposit-hold-4 (← AC-deposit-hold-3) — 이월 공동풀 균등 차감

- **Given** 공동 풀 2000P, 참가자 4명, 1인 최대 벌금 3000P · **When** 활성화 · **Then** 균등 차감
- **expected**: 각자 hold = 3000 − 2000/4 = 2500P, 4명 각 `delta=-2500`

### TS-deposit-hold-5 (← AC-deposit-hold-5) [불변식] — 잔액 = Σdelta

- **Given** 임의 이력 N행 · **When** 잔액 조회 · **Then** 합과 일치
- **expected**: 표시 잔액 == SUM(delta) (balance 컬럼 drift 없음)

### TS-deposit-gauge-1 (← AC-deposit-gauge-1·2) — 차감 예정액 게이지

- **Given** 진행 중 doneCount < goalCount · **When** 게이지 열기 · **Then** 잔액 + 차감 예정액
- **expected**: 차감 예정액 = `confirmedPenalty`(주 단위 누적)와 일치, "실제 이동" 고지 노출

### TS-settle-1 (← AC-settle-1) — 달성자 환급 + 미달분 공동주머니

- **Given** 종료, 3명 중 2명 달성·1명 미달(1000P) · **When** 정산 · **Then** release + pool
- **expected**: 달성 2명 `deposit_release`, 미달 `delta=-1000 penalty`, `settlements.pool_points=1000`, 개인 재분배 0행

### TS-settle-2 (← AC-settle-4) — 미달분 주 단위 누적

- **Given** 4주 챌린지 2주 달성 · **When** 정산 · **Then** 끝난 주 기준 누적
- **expected**: penalty = Σ(미달 주 × 주 벌금), binary 아님

### TS-settle-3 (← AC-settle-3) — 현금성 용도 차단

- **Given** 공동 주머니 잔액 · **When** 현금 용도 시도 · **Then** 차단
- **expected**: 현금화 경로 노출 안 됨(앱 내 이월만)

### TS-settle-4 (← AC-settle-7) — 정산 스냅샷 불변

- **When** 정산 확정 · **Then** 스냅샷 저장
- **expected**: `settlements` 1행 + `distribution` jsonb, 사후 변경에도 재조회 시 불변

### TS-settle-trigger-1 (← AC-settle-trigger-2) — 48h 이의 / 72h auto-settle

- **Given** 마감 후 30h · **When** cron · **Then** 미실행 · **expected**: 정산 0건
- **Given** 마감 후 73h 미트리거 · **When** cron · **Then** auto-settle · **expected**: `settled_by=auto` 1행

### TS-settle-trigger-2 (← AC-settle-trigger-3) [불변식] — 이중 정산 idempotency

- **Given** 이미 정산됨 · **When** 재트리거(클릭 + cron 동시) · **Then** no-op
- **expected**: `settlements` 1행 유지, 추가 원장 0행

### TS-settle-trigger-3 (← edge) — 정산 직전 doneCount 변동

- **Given** 반려로 doneCount 감소 · **When** 정산 · **Then** 재계산
- **expected**: penalty가 갱신된 doneCount로 산정

### TS-points-use-1 (← AC-points-use-1) — 현금화 불가

- **When** 현금 인출 시도 · **Then** 불가 · **expected**: 인출 경로 없음

### TS-points-use-2 (← AC-points-use-2) — 다음 보증금 사용

- **Given** 환급 잔액 보유 · **When** 다음 서약 · **Then** 보증금 사용
- **expected**: 새 `deposit_hold`가 환급 잔액에서 차감

---

## Coverage Matrix

| AC prefix      | Happy    | Edge | Error/불변식      |
| -------------- | -------- | ---- | ----------------- |
| deposit-hold   | TS-1·3·4 | TS-4 | TS-2·TS-5(Σdelta) |
| deposit-gauge  | TS-1     | —    | —                 |
| settle         | TS-1·2   | TS-2 | TS-3·TS-4         |
| settle-trigger | TS-1     | TS-3 | TS-2(idempotency) |
| points-use     | TS-2     | —    | TS-1              |

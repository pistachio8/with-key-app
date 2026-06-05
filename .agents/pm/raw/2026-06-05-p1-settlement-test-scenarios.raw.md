# [RAW] P1 포인트 보증금 정산 — Test Scenarios

Source: pm-execution:test-scenarios 2026-06-05
Feature: P1 포인트 보증금 정산 (fromwith RN MVP)
PRD SoT: docs/migration/01-rn-mvp-prd.md §5.C
형식: Given / When / Then + expected(결정론 우선). PRD AC와 1:1. 최종 SoT는 Agent Task eval 수용기준(D10).

> raw 초안. normalize 시 표준 헤더 · `Parent: PRD-AC-<id>` · `Track: greenfield` 주입 → docs/pm/test-scenarios.md.

---

## deposit-hold (← AC-deposit-hold-\*)

### TS-deposit-hold-1 (← AC-deposit-hold-1·2) — 서약 시 hold = 최대 누적 벌금

- **Given** 사용자 적립 잔액 5000P, 챌린지 최대 누적 벌금 3000P
- **When** 서약(sign)
- **Then** 보증금이 hold 된다
- **expected**: 원장에 `delta=-3000, reason=deposit_hold` 1행 append, 가용 잔액 = 2000P (= 5000 − 3000)

### TS-deposit-hold-2 (← AC-deposit-hold-4) — 잔액 부족 시 서약 차단

- **Given** 적립 잔액 1000P, 필요 hold 3000P
- **When** 서약 시도
- **Then** 서약이 차단된다
- **expected**: 서약 거부 + 부족액 2000P 고지, 원장 변화 0행(무보증 참여 없음)

### TS-deposit-hold-3 (← AC-deposit-hold-4) — 신규 유저 초기 그랜트로 첫 서약

- **Given** 가입 직후 잔액 0P, 첫 챌린지 hold 1000P
- **When** 첫 서약
- **Then** 초기 그랜트 후 hold
- **expected**: 원장 순서대로 `delta=+1000, reason=bundle_grant` → `delta=-1000, reason=deposit_hold`, 가용 잔액 0P

### TS-deposit-hold-4 (← AC-deposit-hold-3) — 이월 공동풀 균등 차감

- **Given** 그룹 공동 풀 2000P, 참가자 4명, 1인 최대 벌금 3000P
- **When** 챌린지 활성화(전원 서명)
- **Then** 풀을 공동 스테이크로 깔고 균등 차감
- **expected**: 각자 hold = 3000 − 2000/4 = 2500P, 4명 각 `delta=-2500`

### TS-deposit-hold-5 (← AC-deposit-hold-5) [불변식·게이트 무관] — 잔액 = Σdelta

- **Given** 임의의 hold/release/grant 이력 N행
- **When** 잔액 조회
- **Then** 표시 잔액이 원장 합과 일치
- **expected**: 표시 잔액 == SUM(delta) (결정론, 별도 balance 컬럼 drift 없음)

## deposit-gauge (← AC-deposit-gauge-\*)

### TS-deposit-gauge-1 (← AC-deposit-gauge-1·2) — 차감 예정액 게이지

- **Given** 진행 중 챌린지, 현재 doneCount < goalCount
- **When** 대시보드 게이지 열기
- **Then** 잔액 + 차감 예정액 표시
- **expected**: 차감 예정액 = `confirmedPenalty`(주 단위 누적, weekly-penalty-accrual)와 일치, "종료 시 실제 이동" 고지 노출

## settle (← AC-settle-\*)

### TS-settle-1 (← AC-settle-1) — 달성자 환급 + 미달분 공동주머니

- **Given** 종료 챌린지, 참가자 3명 중 2명 달성·1명 미달(미달분 1000P)
- **When** 정산 확정
- **Then** 달성자 release, 미달분은 pool로
- **expected**: 달성자 2명 `delta=+hold, reason=deposit_release`, 미달자 `delta=-1000, reason=penalty`, `settlements.pool_points=1000`, 개인 간 재분배 0행

### TS-settle-2 (← AC-settle-4) — 미달분 주 단위 누적(binary 아님)

- **Given** 4주 챌린지, 2주만 목표 달성
- **When** 정산
- **Then** 미달분 = 끝난 주 기준 누적
- **expected**: penalty = Σ(미달 주 × 주 벌금), 전체 1회 binary 계산 아님

### TS-settle-3 (← AC-settle-3) — 현금성 용도 차단

- **Given** 그룹 공동 주머니 잔액 존재
- **When** 회식·기부·현금환급 등 현금 용도 시도
- **Then** 차단(앱 내 이월/적립만)
- **expected**: 현금화 경로 노출 안 됨

### TS-settle-4 (← AC-settle-7) — 정산 스냅샷 불변

- **When** 정산 확정
- **Then** 정산 결과 스냅샷 저장
- **expected**: `settlements` 1행 + `distribution` jsonb 저장, 사후 멤버십/벌금모델 변경에도 재조회 시 분배 불변

## settle-trigger (← AC-settle-trigger-\*)

### TS-settle-trigger-1 (← AC-settle-trigger-2) — 48h 이의기간 / 72h auto-settle

- **Given** 마감 후 30h(이의제기 기간 48h 내)
- **When** auto-settle cron 실행
- **Then** 미실행(doneCount 미확정)
- **expected**: 정산 0건
- **Given** 마감 후 73h, 그룹장 미트리거
- **When** cron 실행
- **Then** auto-settle
- **expected**: `settlements.settled_by=auto` 1행

### TS-settle-trigger-2 (← AC-settle-trigger-3) [불변식·게이트 무관] — 이중 정산 idempotency

- **Given** 이미 정산된 챌린지
- **When** 정산 재트리거(그룹장 클릭 + auto-settle cron 동시)
- **Then** no-op
- **expected**: `settlements` 여전히 1행, 추가 원장 0행, 잔액 불변

### TS-settle-trigger-3 (← edge) — 정산 직전 doneCount 변동

- **Given** 정산 직전 피어 반려로 한 명 doneCount 감소
- **When** 정산
- **Then** 변경된 doneCount 기준 재계산
- **expected**: penalty가 갱신된 doneCount로 산정(정산 보류/재계산 경로)

## points-use (← AC-points-use-\*)

### TS-points-use-1 (← AC-points-use-1) — 현금화 불가

- **When** 포인트 현금 인출 시도
- **Then** 불가
- **expected**: 인출 경로 없음(closed-loop)

### TS-points-use-2 (← AC-points-use-2) — 다음 보증금에 사용

- **Given** 환급 포인트 잔액 보유
- **When** 다음 챌린지 서약
- **Then** 보증금에 사용
- **expected**: 새 `deposit_hold`가 환급 잔액에서 차감(잔액 = Σdelta 일관)

---

## Coverage Matrix (raw)

| AC prefix      | Happy    | Edge            | Error/불변식                |
| -------------- | -------- | --------------- | --------------------------- |
| deposit-hold   | TS-1·3·4 | TS-4(공동풀)    | TS-2(차단)·TS-5(Σdelta)     |
| deposit-gauge  | TS-1     | —               | —                           |
| settle         | TS-1·2   | TS-2(주단위)    | TS-3(현금차단)·TS-4(스냅샷) |
| settle-trigger | TS-1     | TS-3(doneCount) | TS-2(idempotency)           |
| points-use     | TS-2     | —               | TS-1(현금화 불가)           |

## Test Data Requirements (raw)

- 적립 잔액 다양(0·1000·5000P), 신규 가입 직후 유저, 공동 풀 보유 그룹, 4주 챌린지, 마감 후 30h/73h 시점 fixture, 부분 달성 참가자 조합.

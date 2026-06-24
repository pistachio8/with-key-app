# ADR-0039: 벌칙 Redemption 정산 — deferred penalty · 2X carry-over · 불변 스냅샷 보존

**Date**: 2026-06-24
**Status**: accepted
**Deciders**: pistachio8 (PO 수락 2026-06-24)
**관련**: spec [`2026-06-23-feed-type-penalty-redesign-design.md`](../superpowers/specs/2026-06-23-feed-type-penalty-redesign-design.md) §C5 · ADR-0032(settlement-verification-data-model) · ADR-0030(early-close-settlement-cutoff) · EVAL-0042 · EVAL-0044 · EVAL-0045

## Context

지금 정산 결과는 "돈을 잃는다" 한 축뿐이다. 친구 그룹에선 "돈 대신 우스꽝스러운 벌칙을 수행"하는 만회(redemption) 경로가 강한 참여 동기다. 벌금(backstop)은 그대로 두되, 벌칙을 **면제 기회**로 얹는다.

문제는 **불변성 보존**이다. redemption은 정산 _후_ 결과를 바꾸는 성격이라, 잘못 설계하면 불변 스냅샷(`settlements`)을 사후 수정하게 된다. ADR-0032가 정한 "1챌린지 1불변 스냅샷" 원칙과 정면 충돌한다.

코드 사실 두 가지가 설계를 강하게 제약한다.

1. **`settlements`엔 작동하는 UPDATE 경로가 없다.** 트리거 `settlements_guard_writes`(`0043:51`, 함수 `0044:42-48`)는 `tg_op<>'INSERT'`를 **무조건 차단**한다(definer/service_role 예외도 INSERT에만 적용). 그런데 현행 `settle_challenge`(`0044`)는 placeholder INSERT(`pool_points=0`) 후 `UPDATE settlements SET pool_points,distribution` 패턴이라 — 정적 분석상 **그 UPDATE 자체가 트리거에 막힌다**(로컬 Supabase 부재로 실행 미검증, 구현 시 `db reset`+RPC 실호출로 확정 필요). 즉 redemption 이전에 기존 정산 RPC에 잠재 Blocker가 있다.
2. **영속 그룹 풀 엔티티가 없다.** `settlements.pool_points`는 _챌린지마다_ 붙는 스냅샷 숫자이고, 대응하는 `+` 원장 행 없이 집계만 된다(`settlement.ts:13`, AC-settle-6 도박 회피). carry-over가 흘러들 "그룹 풀"의 정체를 코드 사실에 맞춰 정해야 한다.

`spec-required` 경로(§4: `supabase/migrations/**`)를 다수 건드리고 정산·RLS 불변성을 재정의하므로 풀 ADR 대상이다.

## Decision

벌칙 redemption 결과는 **`settlements` 스냅샷을 절대 사후 수정하지 않고 forward(다음 챌린지로 이월)로만 흐른다**. 세부:

- **deferred penalty** — `penalty_mission`이 있는 벌칙 챌린지는 정산 시 보증금 전액 환급(+H)만 적용하고, weekly 미달분 X는 이 정산에서 **차감하지 않는다(deferred)**. 스냅샷 `distribution`엔 `redemption_pending: true` 메타만 기록한다. X는 정산 시점이 아니라 **창1이 닫히는 종료+48h에 확정**되므로, 불변 스냅샷에 확정 X값을 박지 않아 사후 X 변경 오염을 원천 차단한다. `penalty_mission` 없는 벌금 전용 챌린지는 기존 동작 그대로(정산 시 −F 즉시).
- **`settle_challenge` INSERT-once 재설계** — pool/distribution을 루프에서 **먼저 계산해 단일 INSERT로 최종값 기록**(사후 UPDATE 제거). 이로써 (1) INSERT-only 트리거 통과, (2) 1 INSERT·영구 무수정의 진짜 불변성, (3) carry-over 2X도 그 INSERT 시점엔 debt가 이미 'open'이라 pool 계산에 자연 귀속. `0044`는 편집하지 않고 forward migration에서 `create or replace`.
- **2X carry-over** — 창2(종료+48~96h) 결과가 `rejected`/`expired`면 `penalty_debts(user_id, origin_challenge_id, amount=2X, status='open')` 기록(debt가 'open'되는 시점 = 종료+96h). `accepted`(면제)는 애초에 차감이 없었으므로 **원장 행 없음**(`point_ledger`는 `CHECK (delta <> 0)`이라 delta 0 메타 행 불가). 면제 감사 추적은 `penalty_proofs.status='accepted'` + 스냅샷의 `redemption_pending`으로 충분.
- **수금(다음 챌린지)** — 사용자가 **원천 챌린지와 같은 `group_id`**의 다음 챌린지 정산에 참여하면, open debt를 `point_ledger`에 `penalty_debt_carryover`(−2X)로 차감하고(`ref_id = penalty_debts.id`로 멱등 — 1회만), 그 2X를 수금 챌린지 정산의 `pool_points` 계산에 포함(사후 UPDATE 아님)한 뒤 debt를 `settled`로 닫는다. `point_ledger.reason`은 native enum이 아니라 **CHECK 제약**(`0042:48-56`)이라 `0054`는 `DROP CONSTRAINT … ADD CONSTRAINT … CHECK (reason in (…, 'penalty_debt_carryover'))` 형태. 타입은 `SettlementReason`(`settlement.ts:21`, 손수 union)에 추가.
- **점수판(scoreboard) 풀 모델** — carry-over는 신규 테이블 없이 기존 pool-as-snapshot 패턴 그대로 "같은 그룹 다음 정산의 `pool_points`에 합산". 풀은 **포인트로만** 존재하며 앱은 현금을 보관·지급하지 않는다. 실제 회식비는 그룹이 앱 밖에서 정산(현금 인출 없음 → 금융 라이선스 불필요). 영속 그룹 풀(`group_pool_ledger`)로의 승격은 **별도 포인트 경제 epic + ADR**로 문서 예약하며 본 결정 범위 밖.

## Alternatives Considered

### 1. 정산을 redemption 창 종료까지 지연 (provisional snapshot 후 finalize)

- **Pros**: penalty를 정상 차감하고 48h 뒤 면제분만 환급하면 carry-over 개념이 단순해진다.
- **Cons**: `settlements`의 "1챌린지 1불변 스냅샷"(ADR-0032) 전제를 깨고, provisional→final 멱등성이 복잡해진다. INSERT-only 트리거와도 충돌.
- **Why not**: 불변성이 이 도메인의 핵심 신뢰 기반이라 깨지 않는다. deferred + forward가 스냅샷을 건드리지 않고 같은 결과를 낸다.

### 2. placeholder INSERT → UPDATE 패턴 유지 (현행 `settle_challenge`)

- **Pros**: 기존 코드 구조를 그대로 둔다.
- **Cons**: `settlements_guard_writes`가 INSERT 외 모든 write를 차단하므로 정적 분석상 UPDATE가 막힌다. carry-over를 사후 UPDATE로 얹으려면 트리거를 약화해야 하고, 그러면 불변성이 무너진다.
- **Why not**: 트리거 약화 = 불변성 포기. 단일 INSERT 재설계가 트리거를 통과하면서 진짜 무수정을 보장한다.

### 3. 그룹 풀 원장(`group_pool_ledger`) 즉시 신설 (P1)

- **Pros**: 벌금·carry-over를 모두 지속 그룹 잔액으로 모아 "공동 사용/인앱 상점" 재원으로 일반화.
- **Cons**: 포인트 용도가 미정인 시점에 구조를 굳히면 잘못된 추상화에 갇힌다. 기존 정산 흐름까지 건드려 이 기능 출시가 늦어진다.
- **Why not**: 확장성은 코드가 아니라 결정 기록으로 보존한다. carry-over는 기존 `pool_points`에 접붙이고 승격은 별도 epic으로 예약.

### 4. 풀을 현금 인출 가능하게 (실제 회식비 지급)

- **Pros**: "벌금이 실제 돈으로 모인다"는 직관에 부합.
- **Cons**: 포인트→현금 전환은 선불전자지급수단/전자금융업 규제 영역. PRD가 이미 "결제/환급 = v1+, 법무 선행"으로 게이팅.
- **Why not**: 점수판 모델 채택 — 풀은 포인트로만, 실제 지출은 앱 밖 정산. 라이선스·법무 불필요.

## Consequences

### 긍정적

- `settlements` 불변성 보존(ADR-0032 유지) + 잠재 Blocker(`settlements_guard_writes` vs UPDATE)를 단일 INSERT 재설계로 함께 해소.
- 신규 메커니즘 최소화 — 미달 판정(weekly accrual)·동료 반려(`peer_rejections`)·append-only 원장(`point_ledger`)을 그대로 재사용.
- 포인트 현금화·금융 라이선스 회피(점수판 모델). 도박성 승자독식 구조도 아님(공동 소비).

### 부정적 / 비용

- deferred penalty는 그 벌금이 이번 보증금으로 담보되지 않는다(보증금은 환급됨).
- 2X 빚은 **원천과 같은 그룹의** 다음 챌린지 참여를 전제로 회수된다 — 그 그룹의 다음 챌린지에 안 들어오거나 다른 그룹에만 참여하면 회수 경로가 없다(POC 친구 그룹 범위에서 수용). 미회수 debt 처리(만료·탕감)는 Out of scope.
- `settle_challenge` 재설계는 redemption과 무관한 기존 정산 RPC도 함께 고치는 변경이라 회귀 테스트 부담이 있다(정산 불변성 회귀 + INSERT-once Blocker 검증).

### 후속 영향

- migration `0053_penalty_redemption.sql`(`penalty_proofs`·`penalty_proof_rejections`·`penalty_debts` + RPC), `0054_point_ledger_redemption_reasons.sql`(`reason` CHECK 확장). 번호는 구현 PR 시점 append-only next available로 재부여.
- `0051`(EVAL-0042)에서 `settle_challenge`를 INSERT-once로 forward `create or replace` + `computeSettlement` deferred 분기 + `SettlementResult.distribution` 메타 확장(`redemption_pending`).
- `docs/BE_SCHEMA.md`에 신규 테이블·`penalty_debt_carryover` reason·정산 불변성 예외 목록 갱신.
- carry-over 수금 RPC는 음수 차감이라 `service_role` 전용(`grant_bundle_points` 패턴) 권장 — EVAL-0045.
- 구현 시 로컬 Supabase로 `pnpm supabase db reset` + RPC 실호출하여 INSERT-once 트리거 통과를 실측 확정.

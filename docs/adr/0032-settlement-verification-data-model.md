# ADR-0032: 정산·자동검증 데이터 모델 (point_ledger · settlements · action_logs immutability 예외)

**Date**: 2026-06-05
**Status**: proposed <!-- accepted / superseded / deprecated -->
**Deciders**: pistachio8 (PO) + BE
**관련**: [RN MVP PRD §6.2·§7 Q9](../migration/01-rn-mvp-prd.md) · [04-rn-architecture §decision debt](../migration/04-rn-architecture.md) · [ADR-0030 조기 종료 정산 cutoff](./0030-early-close-settlement-cutoff.md) · spec [weekly-penalty-accrual](../superpowers/specs/2026-06-02-weekly-penalty-accrual.md)

## Context

RN MVP는 POC에서 "표시만"이던 벌금(`challenges.penalty_amount`)을 **실제 포인트 정산(P1)** 으로, 그룹장 수동 판정을 **사진 자동검증(P2)** 으로 전환한다([PRD §5.C·§5.B](../migration/01-rn-mvp-prd.md)). 두 신기능 모두 기존 BE_SCHEMA에 없던 데이터를 요구하는데, PRD §6.2는 **제품 수준 델타만** 적고 정확한 DDL(Data Definition Language, 테이블·컬럼 정의)·RPC(Remote Procedure Call, Postgres 함수)·RLS(Row Level Security, 행 단위 접근 제어)는 본 ADR로 미뤘다. [04-rn-architecture](../migration/04-rn-architecture.md)도 이 결정을 Phase 1 진입 전 갚아야 할 decision debt로 등록했다.

해결해야 할 제약:

1. **정산은 금전성이다.** ⓑ적립/번들 포인트(현금화 불가 closed-loop)라도 보증금 hold·forfeit·이월은 분쟁·감사 추적이 필요하다(PRD F4·E2). 잔액을 컬럼 하나로 들고 UPDATE 하면 "왜 이 값이 됐는가"를 잃는다.
2. **정산은 결정론이어야 한다.** 이중 정산 방지(`AC-settle-trigger-3`)와 잔액 정합(`AC-deposit-hold-5`, 잔액=Σdelta)은 **게이트(G1·G2)와 무관하게 즉시 활성**인 불변식이다([05-harness §3](../migration/05-rn-harness-decisions.md)).
3. **action_logs는 현재 immutable이다.** 인증 로그는 `al_update_self_5min`(작성 5분 내 본인) 외에는 UPDATE 정책이 없어 사실상 불변이다(job stories S2·E4). 그런데 자동검증(P2)은 **비동기 확정·override**라 작성 한참 뒤 status를 서버가 UPDATE 해야 한다 — immutability 모델에 좁은 예외가 필요하다([PRD Q9](../migration/01-rn-mvp-prd.md#7-open-questions)).
4. **RN은 Server Action을 못 쓴다.** 쓰기 경로가 RPC 직접 호출 또는 BFF(Backend-for-Frontend)로 승격되므로(migration §9), 권한·트랜잭션·정합성은 DB 안(SECURITY DEFINER RPC)에서 닫혀야 한다 — 클라이언트 토큰이 원장에 직접 INSERT 하게 두면 RLS만으로 금전 정합을 못 지킨다.

## Decision

**정산·자동검증의 모든 금전성·검증상태 write는 `SECURITY DEFINER` RPC 한 경로로 닫고, 데이터는 append-only 원장 + 불변 스냅샷으로 적재한다. RLS는 "같은 그룹 read / write는 서버(RPC)만"을 기본으로 하며, action_logs에만 검증 status 컬럼 한정 서버 전용 UPDATE 예외를 둔다.** 기존 0002·0021 패턴(`is_group_member()` 헬퍼 · service_role-only write · 가드 트리거)을 재사용하고 새 패턴을 만들지 않는다.

세부 — DDL은 후속 migration(`0042+`)이 본 ADR을 SoT로 구현한다. 컬럼 타입/제약 컨벤션은 기존 테이블과 동일(`uuid primary key default gen_random_uuid()` · `created_at timestamptz not null default now()` · CHECK는 테이블 정의에 위임).

### 1. `point_ledger` — append-only 포인트 원장

```sql
-- 0042_point_ledger.sql (구현 스케치 — 정확본은 migration)
create table public.point_ledger (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id),
  group_id     uuid not null references public.groups(id),
  challenge_id uuid references public.challenges(id),   -- bundle_grant 등 챌린지 무관 이동은 null
  delta        integer not null,                        -- signed: hold=음수, release=양수 등
  reason       text not null check (reason in
                 ('bundle_grant','deposit_hold','deposit_release','penalty','distribution','refund')),
  ref_id       uuid,                                    -- 원천 행(settlements.id 등) 추적
  created_at   timestamptz not null default now()
);
create index idx_point_ledger_user_group on public.point_ledger(user_id, group_id);
```

- **잔액 = `SUM(delta)`** (user·group 스코프). 별도 balance 컬럼을 두지 않는다 → drift 불가능(불변식 2 강제).
- **UPDATE/DELETE 정책 없음 = append-only.** 정정은 반대 부호 보정행을 append(회계 원장 방식).
- RLS SELECT: 본인(`user_id = auth.uid()`) **또는** 동일 그룹 멤버(`is_group_member(group_id)`) — 그룹 정산 투명성. INSERT/UPDATE/DELETE 정책 없음 → 클라 deny, write는 RPC(SECURITY DEFINER)만.

### 2. `settlements` — 불변 정산 스냅샷

```sql
-- 0043_settlements.sql (구현 스케치)
create table public.settlements (
  challenge_id uuid primary key references public.challenges(id),  -- 1챌린지 1정산 = idempotency 키
  settled_at   timestamptz not null default now(),
  settled_by   text not null check (settled_by in ('owner','auto')),
  pool_points  integer not null,                  -- 공동 주머니로 이월된 미달분 합
  distribution jsonb   not null                   -- 참가자별 release/forfeit 스냅샷
);
```

- `challenge_id`를 **PK로 둬서 이중 정산을 스키마 레벨에서 차단**(`AC-settle-trigger-3`). 정산 RPC는 `insert ... on conflict (challenge_id) do nothing` 후 영향 행이 0이면 no-op(멱등).
- **분배 규칙은 챌린지 시작 시 고정**(`AC-settle-5`)이라 `distribution`은 재계산이 아닌 **확정 시점 스냅샷**. 사후 멤버십·벌금모델 변경에도 정산 기록은 불변.
- RLS SELECT: 동일 그룹 멤버. write 정책 없음 → 정산 RPC만.

### 3. `challenge_participants.deposit_points`

- 컬럼 추가(`integer`, hold 금액)는 게이지 read 편의용 **denormalized 캐시**이며 SoT는 어디까지나 `point_ledger`(잔액=Σdelta). 둘이 갈리면 원장이 이긴다. (원장 파생만으로 충분하면 컬럼은 생략 가능 — migration 시점 BE 판단.)

### 4. `action_logs` 검증 컬럼 + immutability 예외 (Q9)

```sql
-- 0044_action_logs_verification.sql (구현 스케치)
alter table public.action_logs
  add column auto_verify_status        text,     -- enum: pending/passed/failed/manual_review/peer_rejected
  add column auto_verify_score         numeric,
  add column auto_verify_model_version text,
  add column photo_phash               text,     -- perceptual hash, 재사용·중복 검출
  add column photo_captured_at         timestamptz;  -- EXIF
```

- 네 컬럼은 **서버 write 전용**. 기존 `prevent_ai_column_update` 가드 트리거(0002)에 이 컬럼들을 추가해 `role <> 'service_role'`의 변경을 `42501`로 거부 — **새 메커니즘 아님, 기존 AI 컬럼 정책의 확장**.
- **immutability 예외**: 자동검증은 비동기 확정이라 status의 사후 UPDATE가 필요하다. 예외 범위는 **(a) 검증 status 컬럼군 서버 UPDATE + (b) 마감 전 사진 1회 교체**(Q7) **둘 다**로 확정한다(Q9). 본인 5분 창(`al_update_self_5min`) 외의 status UPDATE는 service_role(RPC)만.

### 게이트·범위 경계

- **production migration apply는 G2(ⓑ적립 포인트 법무 검토) 통과 전 보류.** 스키마 설계·로컬 검증·코드 작성은 게이트와 무관(불변식은 즉시 활성).
- **본 ADR 범위 밖**(별도 산출물): RPC 시그니처 확정(`hold_deposit`·`settle_challenge`·`grant_bundle_points`·`distribute_pool`) → 후속 spec/migration. 신규 AnalyticsEvent(`settlement_triggered`·`settlement_auto` 등) → PRD §9.1 + spec. 익명 반려(🟨) reaction 저장 모델(kudos union 변경) → PO 승인 + 별도 spec.

## Alternatives Considered

### 1. balance 컬럼 직접 UPDATE (원장 없이)

- **Pros**: 잔액 read가 단일 컬럼 — aggregate 불필요. 구현 단순.
- **Cons**: "왜 이 잔액인가" 이력 소실. 동시 UPDATE race로 정합 깨짐. 분쟁 시 재구성 불가.
- **Why not**: 정산은 금전성(F4)이라 감사·분쟁 추적이 핵심 요구. 잔액 drift를 원천 차단하려면 이벤트소싱이 맞다. 성능은 인덱스 + 필요 시 후속 materialized 잔액으로 대응.

### 2. settlements를 read 시점 파생 계산 (스냅샷 없이)

- **Pros**: 테이블 1개 절약. 항상 "현재 규칙"으로 계산.
- **Cons**: 분배 규칙·멤버십·벌금모델이 사후 바뀌면 과거 정산 결과가 흔들림(drift). 정산은 한 번 확정되면 불변이어야 함(`AC-settle-5`).
- **Why not**: 정산은 법적·신뢰 관점에서 **확정 시점의 고정 기록**이어야 한다. 파생은 재현 불가능한 분쟁을 부른다.

### 3. action_logs 불변 유지 + 별도 `action_log_verifications` 1:1 테이블

- **Pros**: action_logs의 immutability 순수성 보존. 검증 데이터는 자유롭게 mutable.
- **Cons**: 피드·doneCount 핫 read 경로마다 join 추가. 검증 status는 본질적으로 그 인증 로그의 속성.
- **Why not**: 이미 AI 컬럼(`ai_summary` 등)이 "action_logs 위의 서버 관리 가변 컬럼"이라는 선례를 0002 트리거로 세웠다. 같은 패턴 확장이 새 join보다 일관적이고 read 비용도 낮다. immutability는 "클라가 못 바꾼다"로 충분히 지켜진다(서버 전용 예외).

## Consequences

### 긍정적

- 금전 이동이 append-only 원장에 전부 남아 **감사·분쟁 추적·이중정산 방지**가 스키마 레벨에서 보장(잔액=Σdelta, settlements PK=challenge_id).
- 결정론 불변식(불변식 2·3)이 **게이트 무관 즉시 검증 가능** — G1·G2 전에도 정합 테스트를 돌릴 수 있다.
- 기존 패턴(RPC SECURITY DEFINER · `is_group_member` · 가드 트리거) 재사용 → 학습·리뷰 비용 최소, 새 가드레일 불필요.

### 부정적 / 비용

- 잔액 read = `SUM(delta)` aggregate. 데이터가 커지면 후속 최적화(materialized 잔액·증분 집계) 필요 — 본 ADR 시점엔 인덱스로 충분 판단.
- action_logs immutability 모델이 **문서화된 예외로 약화**된다(검증 status·사진 1회 교체). 가드 트리거 컬럼 목록을 누락하면 클라 위조 위험 — 트리거 테스트 필수.
- forward-only migration(POC 정책, down 없음)이라 `0042+` 적용 후 스키마 되돌리기는 nullable/no-op 폴백으로만.

### 후속 영향

- **migration 작성**(`supabase/migrations/0042+`): `point_ledger` · `settlements` · `action_logs` 컬럼 + RLS + 가드 트리거 확장. 각 migration은 본 ADR을 근거로 인용(spec-required 경로).
- **BE_SCHEMA.md 갱신**: 신규 테이블 2개 + action_logs 컬럼 + RLS predicate를 SoT 문서에 반영.
- **DECISION_NEEDED 해소**: 본 ADR 채택 시 04-rn-architecture decision-debt 행("point_ledger·settlements·immutability 예외") 닫힘. PRD §9.5 후속 항목 완료.
- **Accept 조건**: BE 리뷰 통과 + Q9 범위 확정(검증 status UPDATE + 사진 1회 교체 둘 다 — 본 ADR이 그렇게 제안). production apply는 별도로 **G2 법무 게이트** flip 후.
- **차단 해제**: greenfield 정산 Agent Task(`EVAL-0005+`)가 본 ADR을 Parent 스키마 근거로 인용 가능해진다.

## 용어집

- **append-only 원장(ledger)**: 행을 수정·삭제하지 않고 추가만 하는 테이블. 잔액은 delta 합으로 도출. 회계·감사에 쓰는 이벤트소싱 방식.
- **idempotency(멱등)**: 같은 작업을 여러 번 실행해도 결과가 한 번 실행과 같음. 여기선 이중 정산 방지.
- **immutability(불변성)**: 한 번 쓰인 행을 바꾸지 않는 성질. action_logs는 인증 로그라 원칙적 불변.
- **SECURITY DEFINER RPC**: 함수 정의자 권한으로 도는 Postgres 함수. RLS를 통과해 service_role 작업을 한 트랜잭션으로 닫는 데 씀.
- **denormalized 캐시**: 빠른 read를 위해 SoT를 복제해 둔 값. 갈리면 SoT(원장)가 우선.
- **G1 / G2**: 빌드 진입 전 선행 게이트. G1=부정탐지 정밀도 PoC, G2=ⓑ적립 포인트 법무 검토.
- **Q9**: PRD Open Question 9 — action_logs immutability 예외 ADR 범위.

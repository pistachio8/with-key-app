---
spec: 2026-06-08-settlement-rpc-ledger
title: 정산·보증금 RPC 시그니처 + 포인트 원장 sign 규약 (WP2)
author: pistachio8
date: 2026-06-08
status: draft
---

## Summary

P1 정산의 금전성 write 5종을 `SECURITY DEFINER` RPC(Remote Procedure Call, Postgres 함수)로 확정하고, append-only 포인트 원장(`point_ledger`)의 delta 부호 규약을 못 박는다. ADR-0032가 "데이터 모델"을 정했고(테이블·RLS·가드), 본 spec은 그 위에서 **RPC 시그니처·원장 sign 규약·가드 보강**을 확정한다(ADR-0032 §게이트·범위 경계가 "RPC 시그니처 확정 → 후속 spec"으로 미룬 항목).

구현: migration `supabase/migrations/0044_settlement_rpcs.sql` + 분배 산식 SoT `packages/domain/src/settlement.ts`. EVAL-0006(WP2).

> 약어: **RPC**(Remote Procedure Call, Supabase Postgres 함수 호출) · **SECURITY DEFINER**(함수 정의자 권한으로 도는 함수) · **RLS**(Row Level Security, 행 단위 접근 제어) · **SoT**(Source of Truth, 단일 기준 원본) · **GUC**(Grand Unified Config, Postgres 런타임 설정값). 나머지는 [용어집](#용어집).

## Why

- **RN은 Server Action을 못 쓴다**(migration §9). 쓰기 경로를 RPC 직접 호출로 승격해야 하므로, 권한·트랜잭션·정합을 DB 안 RPC에서 닫아야 한다.
- **정산은 금전성**이라 "왜 이 잔액인가"를 잃으면 안 된다 → balance 컬럼 없이 잔액=Σdelta. 그러려면 delta 부호 규약이 한 곳에 못 박혀야 web·RN·SQL이 갈리지 않는다.
- **가드 충돌**: 0042/0043의 write 가드 트리거가 `request.jwt.claims->>'role' = 'service_role'`만 허용한다. 그런데 SECURITY DEFINER는 그 GUC를 바꾸지 않아, authenticated 그룹장이 `settle_challenge`(settled_by='owner')를 호출하면 원장 INSERT가 `42501`로 막힌다. 이 충돌을 풀어야 "그룹장 수동 정산"이 동작한다.

## Decision

### D1. 원장 sign 규약 — "release-full + penalty"

서약·정산의 포인트 이동을 다음 3종 원장 행으로 표현한다(`point_ledger.delta` signed).

| 시점 | reason            | delta | 의미                                  |
| ---- | ----------------- | ----- | ------------------------------------- |
| 서약 | `deposit_hold`    | `-H`  | 보증금 H를 적립 잔액에서 hold         |
| 정산 | `deposit_release` | `+H`  | 보증금 **전액** 환급                  |
| 정산 | `penalty`         | `-F`  | 미달분 F만 재차감, `F=min(H, 미달분)` |

- 달성자(F=0): `deposit_release(+H)` 한 줄 → net 0(보증금 전액 환급, `AC-settle-1`).
- 미달자: `deposit_release(+H)` + `penalty(-F)` → net `-F`(미달분만 손실, 보증금 한도).
- 미달분 합 `ΣF`는 `settlements.pool_points`(그룹 공동 주머니)로만 적재 — **개인↔개인 재분배 원장 행 없음**(도박 위험 회피, `AC-settle-6`).

**왜 release-full(전액 환급 후 재차감)인가**: 모든 금전 이동이 원장에 "명시 행"으로 남아 감사·분쟁 추적이 된다(`AC-settle-7`). "환급액(net)만 한 줄" 모델은 행이 적지만 미달분이 암묵(hold−release 차이)이 되어 추적성이 떨어진다. 잔액은 어느 쪽이든 `-F`로 동일.

**불변식**(게이트 무관 즉시 검증, `packages/domain/src/settlement.spec.ts`):

- 정합: 각 참가자 `held = net + forfeit`, `pool_points = Σforfeit`.
- 잔액 = Σdelta: `grant→hold→settle` 생애 후 잔액 = `grant - forfeit`(drift 0, `AC-deposit-hold-5`).
- binary 아님: `forfeit`는 주 단위 누적(`confirmedPenalty`)에 비례(`AC-settle-4`).

### D2. RPC 시그니처 5종 (전부 `SECURITY DEFINER`)

| RPC                                                | 호출자                   | 멱등 키                          |
| -------------------------------------------------- | ------------------------ | -------------------------------- |
| `grant_bundle_points(user, group, amount, ref_id)` | service_role(BFF) 전용   | `ref_id`                         |
| `hold_deposit(challenge, amount)`                  | 본인(서명 참가자)        | `(user, challenge)` deposit_hold |
| `deposit_release(challenge, user)`                 | 그룹장·본인·service_role | `deposit_points=0`               |
| `settle_challenge(challenge)`                      | 그룹장(owner)·cron(auto) | `settlements.challenge_id` PK    |
| `distribute_pool(challenge)`                       | 그룹 멤버(read)          | (read)                           |

- `grant_bundle_points`는 무상 포인트 발행이라 BFF(service_role)만 — 함수 내부에서 role 재검증.
- `settle_challenge`는 `insert into settlements ... on conflict (challenge_id) do nothing` 후 영향 행 0이면 즉시 return → **이중 정산 no-op**(`AC-settle-trigger-3`). 클릭+cron 동시 트리거에도 정산 1회.
- `hold_deposit`의 `(user, challenge)` 멱등은 함수 내 if-exists 가드만으로는 동시 호출 race 가 남는다 → `ux_point_ledger_deposit_hold` partial unique index `(user_id, challenge_id) where reason='deposit_hold'` + INSERT `on conflict do nothing`로 **원자적 멱등**. 경쟁에서 진 트랜잭션은 0행 삽입 후 no-op(중복 hold `-2H` 차단). settle의 PK 전략과 대칭.
- 미달분은 `_settlement_confirmed_penalties(challenge)`가 `apps/web/src/lib/challenge/weekly.ts`를 SQL로 포팅해 산정(KST 일자·자투리 주 ceil 비례·`closed_at` cutoff = ADR-0030 정합).
- 잔액 read: `point_balance(user, group)`(SECURITY INVOKER, RLS 통과) = `SUM(delta)`. TS는 `apps/web/src/lib/db/reads/point-balance.ts`.

### D3. 가드 보강 — definer 경로 허용

0042/0043의 3개 가드 트리거(`prevent_point_ledger_direct_write`·`prevent_settlements_direct_write`·`prevent_challenge_participants_deposit_points_write`)를 0044에서 `create or replace`로 보강한다. write 허용 조건:

```
service_role(request.jwt.claims) 또는 current_user NOT IN ('anon','authenticated')
```

**왜 `current_user`인가**: SECURITY DEFINER 함수 안에서 INSERT는 함수 소유자(postgres)로 실행되므로 트리거 시점 `current_user='postgres'`(클라 역할이 아님). 직접 클라 write는 `current_user`가 `anon`/`authenticated`. 이 차이로 "definer RPC 통과 / 직접 클라 차단"을 환경 무관하게 가른다. service_role 직접 write(BFF/cron)는 기존대로 함께 허용(2차 방어선). RLS는 point_ledger/settlements에 write 정책이 없어 직접 클라 write를 이미 1차 deny한다.

## Alternatives Considered

- **net-only 원장(미달분 암묵)**: 정산 시 환급액(H−F)만 한 줄. 행은 적지만 미달분이 명시 행으로 안 남아 감사·`AC-settle-7` 약화. 기각.
- **개인 재분배(미달분을 달성자에게 분배)**: 도박 위험 → `AC-settle-6` 위반. 기각(pool은 그룹 자산으로만 이월).
- **가드를 GUC 플래그(`set_config('app.x','on')`)로 보강**: RPC마다 set_config 보일러플레이트 필요 + 새 패턴. `current_user` 검사가 보일러플레이트 0이고 환경 무관이라 기각.
- **balance 컬럼 직접 UPDATE**: ADR-0032에서 이미 기각(drift·이력 소실). 본 spec은 그 결정을 RPC로 구현.

## Verification

```bash
pnpm test -- settlement
```

```bash
pnpm typecheck
```

```bash
pnpm lint
```

```bash
pnpm harness:check
```

- 로컬(DB 불필요): `packages/domain/src/settlement.spec.ts` 결정론 불변식(idempotency·정합·잔액=Σdelta·binary 아님·보증금 한도).
- CI 전용(migration apply 후): RPC 권한·역할 테스트 — 클라 토큰 직접 INSERT `42501`, authenticated 그룹장 `settle_challenge` 성공, 재트리거 추가 원장 0행.

## Rollout

POC 단방향 migration. `0044` apply는 **G2(법무) 통과 후**(ADR-0032 §게이트). 그 전까지 결정론 불변식만 로컬 검증. 롤백은 forward-only이라 RPC를 no-op로 `create or replace`하거나 호출처 제거로 무력화(테이블/컬럼 drop 안 함).

## 용어집

- **append-only 원장**: 행을 수정·삭제하지 않고 추가만 하는 테이블. 잔액은 delta 합으로 도출.
- **confirmedPenalty**: 주 단위로 누적한 미달분(끝난 주만 합산). 산식 SoT는 `apps/web/src/lib/challenge/weekly.ts`.
- **cutoff**: 정산 기준 마지막 일차. 조기 종료(`closed_at`)면 종료일까지의 완전히 끝난 주만 정산(ADR-0030).
- **GUC**: Postgres 런타임 설정값. `request.jwt.claims`는 PostgREST가 요청마다 set하는 트랜잭션 로컬 GUC.
- **idempotency(멱등)**: 같은 작업을 여러 번 실행해도 결과가 1회와 같음. 여기선 이중 정산 방지.
- **pool_points**: 미달분이 모이는 그룹 공동 주머니. 다음 챌린지 hold 시 공동 스테이크로 소비(WP3).
- **release-full + penalty**: 정산 시 보증금을 전액 환급(+H)한 뒤 미달분만 재차감(-F)하는 원장 규약.
- **SECURITY DEFINER**: 함수 정의자(소유자) 권한으로 도는 Postgres 함수. RLS를 통과해 서버 작업을 한 트랜잭션으로 닫는다.

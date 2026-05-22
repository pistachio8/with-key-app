# ADR-0017-kudos-push-log-dedup-table: kudos push 중복 발송 차단을 위한 전용 테이블

**Date**: 2026-05-22
**Status**: proposed
**Deciders**: pistachio8

## Context

[plan: 2026-05-22-kudos-received-notification](../superpowers/plans/2026-05-22-kudos-received-notification.md) 의 초기 idempotency 설계 — `(recipient, actionLog, actor)` 5분 윈도우 에서 `events` 테이블 조회 — 는 다음 race 결함을 가짐 (검토 H1):

- analytics `track()` 의 `events` INSERT 는 fire-and-forget ([`src/lib/analytics/track.ts`](../../src/lib/analytics/track.ts)).
- actor A 가 kudos INSERT 직후(<1~2초) emoji 변경 → 두 번째 dispatch 진입 시 첫 `notification_sent` row 가 아직 commit 전 → idempotency miss → push 중복 발송.
- 즉 "5분 윈도우" 의 실효 보장은 첫 INSERT commit 이후 부분에만 적용되고, 첫 수초 구간은 보호되지 않음. 사용자가 가장 spam 을 느낄 구간 (연타) 이 정확히 그 구멍.

events 기반 idempotency 가 `markActionStarted` 에서 동작하는 이유: 그 경로는 1일 1회 윈도우 + 동일 사용자가 1일 안에 두 번 시작 클릭하는 빈도가 낮음 — race window 가 사용자 행동 빈도에 비해 무시할 수준. kudos 는 정반대로 연타가 흔함.

## Decision

신규 테이블 **`public.kudos_push_log`** 를 도입해 kudos push 발송 dedup 을 **DB-level UNIQUE 제약** 으로 강제한다. 윈도우 개념 폐지 — `(recipient_user_id, action_log_id, actor_user_id)` 조합당 영구 1회.

- 신규 migration: `supabase/migrations/0034_kudos_push_log.sql`
- 스키마:
  ```sql
  create table public.kudos_push_log (
    recipient_user_id uuid not null references public.users(id) on delete cascade,
    action_log_id     uuid not null references public.action_logs(id) on delete cascade,
    actor_user_id     uuid not null references public.users(id) on delete cascade,
    sent_at           timestamptz not null default now(),
    primary key (recipient_user_id, action_log_id, actor_user_id)
  );
  ```
- RLS: enable + service_role only (anon/authenticated 차단). `events` 테이블과 동일 패턴.
- dispatch 동작: send 직전에 **선예약 INSERT** 후 send. UNIQUE violation(`23505`) 또는 `ON CONFLICT DO NOTHING` 으로 0 row 영향 → 즉시 skip. send 실패 시 row 삭제(보상 트랜잭션) — 동일 actor 가 retry 가능하도록.
- ON CONFLICT 옵션: `INSERT ... ON CONFLICT DO NOTHING RETURNING 1` 로 단일 round-trip dedup. RETURNING 으로 INSERT 성공 여부 판정.

## Alternatives Considered

### 1. events 테이블 + 5분 윈도우 유지 (초기 안)

- **Pros**: 새 테이블 불요. migration 1개 절약.
- **Cons**: §Context 의 race 구멍. spam 보호가 형식적.
- **Why not**: 사용자 요청의 핵심이 spam 방지인데 그 구멍이 곧 사용자가 spam 을 가장 강하게 느낄 구간.

### 2. Redis / Upstash 같은 외부 캐시로 dedup

- **Pros**: 빠른 SETNX 로 atomic. TTL 자동.
- **Cons**: 외부 의존 추가 (Upstash 등록·비용·env). POC 범위 초과.
- **Why not**: Postgres UNIQUE 가 같은 atomicity 보장하면서 인프라 추가 없음.

### 3. Postgres advisory lock + 윈도우 조회

- **Pros**: 새 테이블 없이 race 해소.
- **Cons**: lock 키 산출 복잡, 가독성 ↓. 모니터링 어려움(어떤 actor 가 보냈는지 row 형태로 남지 않음).
- **Why not**: UNIQUE 보다 추론·디버깅 비용 큼.

## Consequences

### 긍정적

- race 영구 해소 — connect 시점에 atomic dedup. 사용자가 연타해도 1회만 발송.
- 발송 히스토리가 row 형태로 남아 후속 분석 (응원 1건당 평균 actor 수 등) 가능.
- 5분 윈도우 같은 임의 상수 폐지 — 인지 부하 감소.

### 부정적 / 비용

- 테이블 row 누적: 사용자 100명 × 인증글 100건 × actor 5명 = 5만 row/년 — Postgres 부담 무시 수준.
- ~~TTL/cleanup 미설치~~ → **90일 TTL cleanup cron 본 PR scope 흡수 (2026-05-22)**. 매주 일요일 04:00 UTC 실행. plan §작업 단계 8 참조.
- ~~SELECT 정책 부재~~ → **service_role only 명시 결정 (2026-05-22)**: 본 PR 동안 dispatch 만 접근. "본인 받은 응원 이력" UX 가 생기면 그때 recipient 본인 SELECT 정책 부여 (UX 결정 동반 — 후속 PR).
- FK CASCADE 동작: action_log 또는 user 삭제 시 자동 cleanup — 추가 코드 불요.

### 후속 영향

- spec [`2026-05-22-kudos-notification-schema`](../superpowers/specs/2026-05-22-kudos-notification-schema.md) §Design §C5 신설.
- plan [`2026-05-22-kudos-received-notification`](../superpowers/plans/2026-05-22-kudos-received-notification.md) §작업 단계 4 의 idempotency 로직 변경 — events 조회 → kudos_push_log INSERT ON CONFLICT.
- analytics `notification_sent` 은 그대로 발화 (관측용) — dedup 책임만 새 테이블로 이전.
- RLS 검증: anon/authenticated 가 본 테이블을 SELECT 시도하면 0 row. dispatch 만 service_role 로 INSERT.
- **cron cleanup**: 신규 `src/app/api/cron/cleanup-kudos-push-log/route.ts` + `vercel.json` cron 항목. TTL 90일, `CRON_SECRET` Bearer 인증 (기존 `deadline-push` 패턴 동일).

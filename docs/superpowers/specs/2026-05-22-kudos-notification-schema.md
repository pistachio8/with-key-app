---
spec: 2026-05-22-kudos-notification-schema
title: Kudos 받음 알림 — validators · analytics · payload 스키마
author: pistachio8
date: 2026-05-22
status: draft
---

## Summary

내 인증글에 다른 사용자가 kudos(응원) 를 INSERT 할 때 발송하는 신규 push 알림 채널의 **타입 SoT(Single Source of Truth) 변경** 을 정의한다.

본 spec 은 코드 변경의 "왜" 와 "shape" 만 다룬다 — 작업 절차는 [`plan: 2026-05-22-kudos-received-notification`](../plans/2026-05-22-kudos-received-notification.md), prefs jsonb 컬럼 변경 결정은 [`ADR-0016`](../../adr/0016-notification-prefs-kudos.md), kudos push 중복 방지 테이블 결정은 [`ADR-0017`](../../adr/0017-kudos-push-log-dedup-table.md).

4개 SoT 가 동시에 확장된다:
1. `notificationPrefsSchema` (`src/lib/validators/push.ts`) — `kudos: z.boolean()` 추가
2. `analyticsEventSchema` (`src/lib/analytics/schema.ts`) — `notification_sent.type` enum 에 `"kudos_received"` 추가, props 에 `actionLogId` · `actorUserId` 옵셔널 필드 추가
3. `PushPayload.type` (`src/lib/push/send.ts`) + `NotificationType` (`src/lib/notifications/store.ts`) — `"kudos_received"` 추가
4. **신규 테이블 `public.kudos_push_log`** — kudos push dedup 의 SoT (ADR-0017). UNIQUE primary key 로 race-free.

가드레일 §3 §AnalyticsEvent ("PRD §9.1 이벤트 표와 1:1, 임의 이벤트 추가 금지 — PO 승인 필요") 에 해당하므로, 머지 전 PO 승인 + PRD §9.1 표 갱신 필요. PR 본문 체크박스로 추적.

## Why

- 현재 `notification_prefs` 는 `{start, deadline}` 만 정의 — kudos 옵트인 표현 불가. 무조건 발송하면 ADR-0013 (default OFF) 정책과 충돌.
- `notification_sent` analytics 이벤트의 `type` enum 이 `"start" | "deadline"` 만 — kudos 알림이 발송되어도 분석 파이프라인에서 카운트 안 됨. 발송 성공률·idempotency 추적 불가.
- `PushPayload.type` 에 kudos 종류가 없어 SW(`public/service-worker.js`) 가 IDB 에 적재할 때 type 필드를 임시값으로 채우게 됨 → `/notifications` 페이지 필터링 불가.
- idempotency 윈도우(`(recipient, actionLog, actor)` 5분 — plan §결정 참조)는 `events` 테이블의 `notification_sent` row 조회로 구현. 따라서 type "kudos_received" 가 events 에 기록되어야 idempotency 가 동작 — analytics 확장이 기능 필수 조건.

## Impact Scope

### 변경 경로

- 신규:
  - `supabase/migrations/0033_notification_prefs_kudos.sql` — ADR-0016 결정의 구현
  - `supabase/migrations/0034_kudos_push_log.sql` — ADR-0017 결정의 구현 (신규 dedup 테이블)
- 수정:
  - [`src/lib/validators/push.ts`](../../../src/lib/validators/push.ts) — `notificationPrefsSchema` `kudos: z.boolean()` 추가
  - [`src/lib/analytics/schema.ts`](../../../src/lib/analytics/schema.ts) — `notification_sent.type` enum 확장 · props 옵셔널 필드 추가
  - [`src/lib/push/send.ts`](../../../src/lib/push/send.ts) — `PushPayload.type` 확장
  - [`src/lib/notifications/store.ts`](../../../src/lib/notifications/store.ts) — `NotificationType` 확장
  - [`src/lib/db/reads/notification-prefs.ts`](../../../src/lib/db/reads/notification-prefs.ts) — `DEFAULT_PREFS` 에 `kudos:false`
  - [`src/types/supabase.ts`](../../../src/types/supabase.ts) — `pnpm db:types` 재생성 결과
  - [`src/lib/validators/push.spec.ts`](../../../src/lib/validators/push.spec.ts) — kudos 키 케이스 추가
  - [`src/lib/analytics/schema-union-parity.spec.ts`](../../../src/lib/analytics/schema-union-parity.spec.ts) — parity 갱신

### src/ 영향

위 §변경 경로 의 6개 파일.

### Supabase / RLS / migration 영향

- `users.notification_prefs` jsonb 의 shape 가 확장됨 (key 추가).
- CHECK 제약 `users_notification_prefs_shape_chk` 가 DROP / ADD.
- **신규 테이블 `public.kudos_push_log`** (ADR-0017). RLS enable + service_role-only 정책.
- 기존 RLS 정책 변경 없음.
- migration 단방향 (POC 정책).

### 외부 서비스

Web Push — payload type 필드에 `"kudos_received"` 신규 값이 추가되어 SW 가 이미 알고 있어야 한다(SW 는 type 을 그대로 IDB 에 저장만 함 — enum 검증 없음. 변경 불요).

## Design

### C1. `notificationPrefsSchema` 확장

```ts
// src/lib/validators/push.ts
export const notificationPrefsSchema = z.object({
  start: z.boolean(),
  deadline: z.boolean(),
  kudos: z.boolean(),
});
```

기존 jsonb row 가 kudos 키 없이 들어오면 zod parse 실패 → `dispatch.ts` 의 `notificationPrefsSchema.safeParse(u.notification_prefs)` 가 그 사용자를 발송 대상에서 제외. **migration 이 모든 row 를 backfill 한 뒤에만 안전** — plan 의 작업 순서에서 migration 우선 적용을 강제.

### C2. `analyticsEventSchema` 확장

```ts
// src/lib/analytics/schema.ts — notification_sent 케이스
z.object({
  name: z.literal("notification_sent"),
  props: z.object({
    type: z.enum(["start", "deadline", "kudos_received"]),
    challengeId: uuid,
    suppressed: z.boolean(),
    outcome: z.enum(["sent", "cleaned", "failed", "suppressed"]),
    actionLogId: uuid.optional(),
    actorUserId: uuid.optional(),
  }),
});
```

`actionLogId` · `actorUserId` 가 옵셔널인 이유: 기존 start/deadline 발송은 이 필드가 의미 없음. discriminated union 으로 더 엄밀히 가르는 옵션도 있으나 `notification_sent` 한 이벤트로 통일하는 게 분석 단순.

### C3. `PushPayload.type` / `NotificationType` 확장

```ts
// src/lib/push/send.ts
type: "start" | "deadline" | "missed_yesterday" | "friend_action" | "penalty_added" | "kudos_received";

// src/lib/notifications/store.ts — NotificationType
| "start" | "deadline" | "missed_yesterday" | "friend_action" | "penalty_added" | "kudos_received";
```

`category` 는 **변경하지 않음** — `kudos_received` 의 category 는 기존 `"friend_action"` 재사용 (grilling 결정). `/notifications` 페이지 탭 "친구 인증" 에 함께 노출됨.

### C4. migration 0033 shape

**트랜잭션 격리 (L3)**: Supabase CLI 의 `supabase db push` / `supabase migration up` 은 각 migration 파일을 **단일 transaction** 으로 실행 (PostgreSQL DDL 트랜잭션 지원). 따라서 아래 DROP → UPDATE → SET DEFAULT → ADD 순서 중간에 다른 세션의 INSERT 가 들어와도 CHECK 위반 없이 atomic 적용. `pnpm supabase db reset` 도 동일 — 명시적 `BEGIN/COMMIT` 불요.

```sql
-- 0033_notification_prefs_kudos.sql
-- ADR-0016 참조. kudos 키 추가 + 기본값 OFF (ADR-0013 일관성).

alter table public.users
  drop constraint if exists users_notification_prefs_shape_chk;

update public.users
  set notification_prefs = notification_prefs || '{"kudos":false}'::jsonb;

alter table public.users
  alter column notification_prefs
  set default '{"start":false,"deadline":false,"kudos":false}'::jsonb;

alter table public.users
  add constraint users_notification_prefs_shape_chk check (
    notification_prefs ?& array['start', 'deadline', 'kudos']
    and jsonb_typeof(notification_prefs -> 'start') = 'boolean'
    and jsonb_typeof(notification_prefs -> 'deadline') = 'boolean'
    and jsonb_typeof(notification_prefs -> 'kudos') = 'boolean'
  );

comment on column public.users.notification_prefs is
  '알림 선호도. {start,deadline,kudos} boolean. 신규 가입자는 OFF.';
```

### C5. `kudos_push_log` dedup 테이블 (ADR-0017 구현)

dispatch helper 내부 idempotency 는 events 윈도우 조회가 아니라 본 테이블에 **INSERT ON CONFLICT DO NOTHING** 으로 atomic 보장 (race-free).

migration 0034 SQL:

```sql
-- 0034_kudos_push_log.sql
-- ADR-0017 참조. kudos push dedup. events 5분 윈도우의 race 해소.

create table public.kudos_push_log (
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  action_log_id     uuid not null references public.action_logs(id) on delete cascade,
  actor_user_id     uuid not null references public.users(id) on delete cascade,
  sent_at           timestamptz not null default now(),
  primary key (recipient_user_id, action_log_id, actor_user_id)
);

comment on table public.kudos_push_log is
  'kudos 받음 push 발송 dedup. PK(recipient,action_log,actor) UNIQUE 로 race-free. ADR-0017.';

-- RLS: service_role 만 접근. anon/authenticated 차단.
alter table public.kudos_push_log enable row level security;

-- 명시적 정책 미부여 = anon/authenticated 0 row.
-- 필요 시 추후 select policy 추가 가능 (예: 본인 받은 push 이력).

create index idx_kudos_push_log_sent_at on public.kudos_push_log (sent_at desc);
```

dispatch helper 내부 사용 패턴:

```ts
// dispatchKudosReceivedNotification 안에서
const { data: reserved, error: insertErr } = await admin
  .from("kudos_push_log")
  .insert({
    recipient_user_id: recipientUserId,
    action_log_id: actionLogId,
    actor_user_id: actorUserId,
  })
  .select("recipient_user_id") // RETURNING — INSERT 성공 행 반환
  .maybeSingle();

// PG error code 23505 = unique_violation → 이미 발송됨
if (insertErr?.code === "23505" || !reserved) {
  return { recipientCount: 0, quietHours: isQuietHoursKST() };
}

// 이후 push 발송. 발송 실패 시 row 삭제(보상) — 동일 actor retry 가능.
try {
  await safeSend(target, payload);
} catch (e) {
  await admin.from("kudos_push_log").delete().match({
    recipient_user_id: recipientUserId,
    action_log_id: actionLogId,
    actor_user_id: actorUserId,
  });
  throw e;
}
```

### 결정 / 금지

- **`category` 확장 금지** — 새 category 신설 시 `/notifications` 탭 추가 + `byCategory` index · 필터링 UI 변경이 필요. 의미상 kudos 도 친구 액션이라 재사용이 자연.
- **type 은 `"kudos_received"` 단일값** — `"kudos_given"` 같은 자기 발송분은 발송하지 않음(본인→본인 RLS 차단).
- **`actionLogId` · `actorUserId` 는 kudos_received 에서만 채움** — 다른 type 에 임의로 채우지 말 것. 분석 단순화.
- **`kudos_push_log` SELECT 정책 부여 금지 (POC)** — 본인 받은 응원 이력 표시 UX 가 생기기 전까지 service_role 만 접근.
- **`kudos_push_log` row 수동 삭제 금지** — FK CASCADE 만 허용 (action_log/user 삭제 시 자동). 수동 삭제는 dedup 무력화.

## Alternatives Considered

1. **Discriminated union 으로 `notification_sent` 분리** (예: `notification_sent_start`, `notification_sent_kudos`) — 타입 엄밀도 ↑. 단점: 분석 SQL 통합 카운트 어려워지고 PRD §9.1 표 비대. 채택 안 함.
2. **category="kudos" 신설** — `/notifications` 탭 분리. 단점: 탭 UI · prefs 토글 · IDB index 모두 동반. 채택 안 함.
3. **prefs 키 추가 없이 dispatch.ts 에서 kudos 만 prefs 무시** — migration 회피. 단점: ADR-0013 위배 + 옵트아웃 불가. 채택 안 함.

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test src/lib/validators/push.spec.ts
pnpm test src/lib/analytics/schema-union-parity.spec.ts
pnpm supabase db reset
```

### 시나리오

- **정상**:
  - `notificationPrefsSchema.parse({start:true, deadline:false, kudos:true})` → 성공
  - `analyticsEventSchema.parse({name:"notification_sent", props:{type:"kudos_received", challengeId, suppressed:false, outcome:"sent", actionLogId, actorUserId}})` → 성공
- **실패/엣지**:
  - `notificationPrefsSchema.parse({start:true, deadline:false})` (kudos 누락) → 실패
  - migration 미적용 상태에서 dispatch 호출 → 해당 사용자 발송 제외(safeParse 실패)
  - `notification_sent.type="start"` 인데 `actionLogId` 동봉 → parse 성공(optional). 분석 SQL 에서 무시.
  - CHECK 위반: jsonb 에 kudos 키 누락 INSERT 시도 → DB level 차단
  - **kudos_push_log UNIQUE 위반**: 동일 (recipient, action_log, actor) 두 번째 INSERT → `ON CONFLICT DO NOTHING` 로 0 row affected → dispatch skip
  - **kudos_push_log RLS**: anon/authenticated 가 `from('kudos_push_log').select()` → 0 row (정책 미부여)

## Rollout

1. PR 머지 직전 — Vercel preview 에서 zod parse · CHECK 동시 통과 확인.
2. main 머지 후 production migration 자동 적용 (Supabase CI).
3. Supabase Studio 에서 dev 계정 prefs.kudos 수동 ON → 실 push 도착 확인.
4. /me 토글 UI follow-up PR 머지 시점에 일반 사용자 옵트인 가능.

### 롤백

- 단일 PR 머지라면 `git revert <merge>` + 신규 migration `0033_notification_prefs_kudos_revert.sql` (kudos 키 제거 + CHECK 복원). down 스크립트 없는 단방향 정책이라 forward-only.
- prefs 컬럼 row 에 kudos 키가 남아도 zod schema 가 strip 모드라 코드 영향 없음.

## Out of scope

- `/me` 페이지 prefs 토글 UI — follow-up PR.
- kudos DELETE 알림 — 사용자 요청 명시적 제외 ("삭제는 말고 생성일때만").
- 다른 알림 카테고리 (penalty, missed_yesterday) 확장 — 별개 작업.
- SW BroadcastChannel 실시간 동기화 — 헤더 dot plan §후속 액션.
- **M4. `/notifications` 탭 라벨 변경 ("친구 인증" → "친구 활동")**: kudos 받음이 같은 탭에 합류하므로 라벨 의미가 좁아짐. 변경 가치 있으나 본 spec 의 타입 SoT 변경 범위 외. 별도 UX 조정 PR 로 분리 — `src/app/(app)/notifications/page.tsx` 의 `TABS` 배열 단순 텍스트 교체.

## 용어집

- **ADR**: Architecture Decision Record — 되돌리기 비용 큰 결정의 짧은 기록
- **CHECK 제약**: Postgres column-level 또는 table-level 무결성 제약. 본 spec 에서는 jsonb 키 존재 강제
- **idempotency**: 같은 조건이면 여러 번 실행해도 결과/부작용 1회. 본 spec 에서는 5분 윈도우 내 중복 push 방지
- **jsonb**: Postgres 의 binary JSON 컬럼 타입. 인덱싱·연산자(`?&`) 지원
- **PRD**: Product Requirements Document
- **SoT**: Single Source of Truth — 중복 정의 없이 한 곳을 기준으로 삼는 원본
- **SW**: Service Worker — 브라우저 백그라운드 스크립트. Web Push 수신 entry

# ADR-0016-notification-prefs-kudos: notification_prefs 에 kudos 키 추가 (default false)

**Date**: 2026-05-22
**Status**: proposed
**Deciders**: pistachio8

## Context

사용자 요청(2026-05-22) — "kudos 가 내 인증글에 달릴 경우에도 알림이 오게 해줘. 삭제는 말고 생성일 때만."

기존 push 인프라([`src/lib/push/dispatch.ts`](../../src/lib/push/dispatch.ts))는 `notification_prefs: { start, deadline }` 두 키 기반으로 수신자 필터링. kudos 받음 알림을 신규 채널로 추가하려면 prefs 에 옵트인 키가 필요하다.

`notification_prefs` 는 jsonb 컬럼이고 [`0014_notification_prefs.sql`](../../supabase/migrations/0014_notification_prefs.sql) · [`0015_notification_prefs_require_keys.sql`](../../supabase/migrations/0015_notification_prefs_require_keys.sql) 의 CHECK 가 `?&` 로 키 존재를 강제. 키 추가는 ALTER + UPDATE + CHECK 재작성 패턴.

[`ADR-0013`](0013-notification-prefs-default-off.md) — 신규 가입자의 `start`/`deadline` 기본값을 OFF 로 정함. 이유: "토글은 켜져 있는데 push_subscriptions row 가 없는" 무성 실패 회귀 방지.

## Decision

`users.notification_prefs` jsonb shape 에 **`kudos: boolean`** 키를 추가하고 **기본값 false** 로 설정한다. CHECK 제약을 `?& array['start','deadline','kudos']` 로 재작성한다.

- 신규 migration: `supabase/migrations/0033_notification_prefs_kudos.sql`
- 기존 row UPDATE: `notification_prefs = notification_prefs || '{"kudos":false}'::jsonb`
- `ALTER COLUMN SET DEFAULT '{"start":false,"deadline":false,"kudos":false}'::jsonb`
- DROP / ADD CHECK: kudos 키 포함된 새 제약
- [`src/lib/db/reads/notification-prefs.ts`](../../src/lib/db/reads/notification-prefs.ts) `DEFAULT_PREFS` 상수에 `kudos:false` 추가
- [`src/lib/validators/push.ts`](../../src/lib/validators/push.ts) `notificationPrefsSchema` 에 `kudos: z.boolean()` 추가

## Alternatives Considered

### 1. prefs.kudos 미신설, 전원 무조건 수신

- **Pros**: migration / ADR 회피. 스코프 최소.
- **Cons**: ADR-0013 정책과 일관성 깨짐(start/deadline 은 옵트인인데 kudos 만 강제). 옵트아웃 불가.
- **Why not**: prefs 3종이 같은 패턴으로 정렬되어야 추후 토글 UI · 백엔드 필터링 코드가 단순.

### 2. 기존 `start` 키에 묶음 (kudos = start 와 동일 토글)

- **Pros**: migration 회피.
- **Cons**: `start` 의 의미("운동 시작 알림")가 흐려져 사용자 혼란. 추후 분리 시 더 큰 마이그레이션.
- **Why not**: 의미 얼탬은 단기 절약을 위해 장기 부채를 만드는 선택.

### 3. 기본값 true

- **Pros**: 신규 가입 직후부터 kudos 알림 자동 수신 — UX 단순.
- **Cons**: ADR-0013 와 정면 충돌. "토글 켜진 줄 모르고 권한 거부 → 무성 실패" 회귀 위험.
- **Why not**: ADR-0013 의 회귀 방지 결정을 뒤집을 새 근거가 없음.

## Consequences

### 긍정적

- prefs 3종(start/deadline/kudos)이 동일 패턴으로 정렬 — 추후 prefs UI · 백엔드 필터링 코드 일관.
- /me 페이지 prefs 토글 추가 시 자연스러운 위치 확보.

### 부정적 / 비용

- 기본 OFF 라 신규 가입자는 토글 ON 전까지 kudos push 미수신. **본 PR 의 `/me` 토글 UI 가 같이 머지되어 사용자가 즉시 옵트인 가능** — 임시 무성 상태 아님.
- DB types 재생성 필요 (`pnpm db:types`) — `src/types/supabase.ts` 갱신.

### 후속 영향

- ~~`/me` 페이지 prefs 토글 UI 추가~~ → **본 PR scope 흡수 (2026-05-22)**. plan §작업 단계 7 참조.
- spec [`2026-05-22-kudos-notification-schema.md`](../superpowers/specs/2026-05-22-kudos-notification-schema.md) — validators / analytics 변경 근거.
- plan [`2026-05-22-kudos-received-notification.md`](../superpowers/plans/2026-05-22-kudos-received-notification.md) — 작업 절차.

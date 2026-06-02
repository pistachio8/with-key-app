-- 0033_notification_prefs_kudos.sql
-- ADR-0016 참조. notification_prefs jsonb 에 kudos 키 추가 + 기본값 OFF (ADR-0013 일관성).

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
  '알림 선호도. {start,deadline,kudos} boolean. 신규 가입자는 OFF — 명시적 토글 ON 시점에 iOS 권한 프롬프트가 트리거되도록.';

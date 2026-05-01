-- 0015_notification_prefs_require_keys.sql
-- 0014 의 CHECK 는 jsonb_typeof(NULL) = 'boolean' 이 NULL 로 평가돼
-- 키 누락을 막지 못한다. `?&` 로 키 존재를 먼저 강제한다.

alter table public.users
  drop constraint if exists users_notification_prefs_shape_chk;

alter table public.users
  add constraint users_notification_prefs_shape_chk check (
    notification_prefs ?& array['start', 'deadline']
    and jsonb_typeof(notification_prefs -> 'start') = 'boolean'
    and jsonb_typeof(notification_prefs -> 'deadline') = 'boolean'
  );

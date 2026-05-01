-- 0014_notification_prefs.sql — users.notification_prefs jsonb.
-- PRD §6.3 알림 2종 (start / deadline) 선호도. POC 범위라 별도 테이블 금지.

alter table public.users
  add column notification_prefs jsonb not null
  default '{"start":true,"deadline":true}'::jsonb;

-- CHECK: start/deadline 키가 반드시 존재하고 boolean 이어야 한다.
alter table public.users
  add constraint users_notification_prefs_shape_chk check (
    jsonb_typeof(notification_prefs -> 'start') = 'boolean'
    and jsonb_typeof(notification_prefs -> 'deadline') = 'boolean'
  );

comment on column public.users.notification_prefs is
  'Push notification preferences. Shape: {"start":bool,"deadline":bool}. See PRD §6.3.';

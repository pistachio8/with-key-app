-- 0031_notification_prefs_default_off.sql — users.notification_prefs default 를 OFF 로 변경.
-- 정합 깨짐 회귀 방지: 신규 가입자가 자동으로 prefs.true 가 박혀 토글이 ON 으로 보이지만
-- push_subscriptions row 가 없는 "토글은 켜져 있지만 푸시 안 옴" 함정을 차단한다.
-- 코드 측 변경 (src/lib/db/reads/notification-prefs.ts 의 DEFAULT_PREFS) 과 정합.
-- 기존 row 영향 없음 — ALTER COLUMN SET DEFAULT 는 future INSERT 에만 적용된다.
-- ADR-0013 참조.

alter table public.users
  alter column notification_prefs
  set default '{"start":false,"deadline":false}'::jsonb;

comment on column public.users.notification_prefs is
  '알림 선호도. {start,deadline} boolean. 신규 가입자는 OFF 로 시작 — 명시적 토글 ON 시점에 iOS 권한 프롬프트가 트리거되도록.';

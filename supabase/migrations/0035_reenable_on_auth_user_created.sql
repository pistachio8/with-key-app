-- 0035_reenable_on_auth_user_created.sql
-- 2026-05-22 회귀: shared Supabase 프로젝트에서 `on_auth_user_created` 트리거가
-- 외부 작업으로 disabled 상태로 변경됨. 결과: GoTrue 의 `auth.admin.createUser`
-- 가 "Database error granting user" 반환 → `public.users` 미동기화 → 모든
-- integration test 가 `groups_owner_id_fkey` · `Invalid login credentials` 도미노로 실패.
-- ADR-0005 (2026-05-15) 와 동일 증상 패턴의 재발이지만, 이번에는 GRANT 가 아니라
-- 트리거 자체의 `tgenabled` 상태가 깨졌다.
--
-- Studio SQL Editor 의 postgres role 은 auth.users 의 owner(supabase_auth_admin)
-- 가 아니므로 `ALTER TABLE auth.users ENABLE TRIGGER` 직접 실행 불가
-- (42501: must be owner of table users). Migration 은 elevated 권한으로 실행되어
-- DROP + CREATE 가능하다. CREATE TRIGGER 는 기본 enabled('O') 로 생성된다.
--
-- 멱등성: DROP IF EXISTS → CREATE. 이미 enabled 상태로 정상 작동 중이면 재생성
-- 만 하고 동작 변화 없음 (트리거 정의가 0001_init.sql 와 동일).
--
-- 상세 근거: docs/adr/0018-reenable-on-auth-user-created-trigger.md

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

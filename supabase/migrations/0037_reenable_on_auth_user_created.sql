-- 0037_reenable_on_auth_user_created.sql
-- 2026-05-27 회귀 (동일 패턴 3회째 — ADR-0005 시초 → ADR-0018 0035 = 2회째 → 본 migration = 3회째).
-- shared Supabase 프로젝트에서 `on_auth_user_created` 트리거가 또 외부 작업으로 disabled 상태로
-- 변경됨. 증상은 0035 와 동일:
--   - `auth.admin.createUser` 가 "Database error granting user" 반환
--   - `public.users` 미동기화 → integration test 39 건이 `groups_owner_id_fkey` ·
--     `Invalid login credentials` · `challenges_group_id_fkey` 도미노로 실패
-- 0035 와 같은 멱등 패턴 (DROP IF EXISTS + CREATE) 으로 트리거를 재생성한다.
-- 트리거 정의는 0001_init.sql · 0035 와 동일 — 함수 본문 변경 없음.
--
-- 상세 근거 + 회귀 history: docs/adr/0018-reenable-on-auth-user-created-trigger.md
-- (본 PR 에서 §회귀 history 섹션 추가).

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

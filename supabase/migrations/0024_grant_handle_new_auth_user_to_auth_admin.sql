-- 0024_grant_handle_new_auth_user_to_auth_admin.sql
-- GoTrue 는 새 유저 가입 시 supabase_auth_admin role 로 on_auth_user_created
-- 트리거를 발화시킨다. 0001_init.sql 에는 본 GRANT 가 누락돼 있었고,
-- shared 프로젝트의 권한 상태가 변경되며 "Database error granting user" 와
-- 후속 FK / Invalid login / 0-row update 도미노 회귀가 표면화됐다.
-- 상세 근거: docs/adr/0005-grant-handle-new-auth-user.md

grant execute on function public.handle_new_auth_user() to supabase_auth_admin;

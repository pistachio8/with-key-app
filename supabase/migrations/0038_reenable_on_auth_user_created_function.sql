-- 0038_reenable_on_auth_user_created_function.sql
-- 2026-05-27 단기 봉합 (ADR-0018 §회귀 history 4회째 — 본 PR 진행 중 1시간 이내 재발).
-- 0037 신설 후 develop merge 시점에 트리거 enable 됐으나, PR #111 (chore/ci-optimization-impl)
-- 의 다음 integration 잡 시작 시점에 또 disable 상태로 회귀 (groups_owner_id_fkey 13건 +
-- Database error granting user 1건 + Invalid login credentials 1건 도미노).
--
-- 회귀 빈도가 5일 → 1시간 이내로 가속되어 매 머지마다 새 migration 박제는 비현실.
-- 대신 service_role 만 execute 가능한 security definer 함수로 트리거 재생성을 멱등 호출 가능하게.
-- CI integration 잡이 apply-migrations 직후 본 RPC 를 매번 호출 → 매 잡 시작 시 트리거 보장.
--
-- 근본 해결책은 ADR-0005 §후속 영향 (local Supabase 이전). 본 migration 은 그 plan/PR 가
-- 진행되는 동안의 봉합. local 이전이 완료되면 본 RPC 와 워크플로 호출 step 모두 제거 가능.
--
-- 멱등성: DROP IF EXISTS + CREATE. 반복 호출 안전 (앞 0035 · 0037 과 동일 본문).
-- 권한: service_role 만 execute (anon · authenticated 차단). signature 변화 없음.
--
-- 상세 근거 + 회귀 history: docs/adr/0018-reenable-on-auth-user-created-trigger.md

create or replace function public.reenable_on_auth_user_created()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  drop trigger if exists on_auth_user_created on auth.users;
  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_auth_user();
end;
$$;

revoke all on function public.reenable_on_auth_user_created() from public, anon, authenticated;
grant execute on function public.reenable_on_auth_user_created() to service_role;

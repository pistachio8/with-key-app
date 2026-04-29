-- CI 스모크용. 애플리케이션 테이블별 RLS ON/OFF 반환.
-- service_role 만 호출 가능(anon/authenticated 은 막힘).
create or replace function public.audit_rls_status()
returns table (tablename text, rowsecurity boolean)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select c.relname::text, c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname not like '\_%'
    and c.relname not in ('schema_migrations');
$$;

revoke all on function public.audit_rls_status() from public, anon, authenticated;
grant execute on function public.audit_rls_status() to service_role;

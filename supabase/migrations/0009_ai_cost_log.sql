-- Why: PRD §5.3 AC-7 "월 AI 비용 한도 초과 시 자동 템플릿 모드".
-- Scope 컬럼: test/prod 호출 격리 (D-014: 단일 Supabase 프로젝트 공유).
-- 단위 micros: 1 cent = 10_000 micros. POC 스케일 호출당 비용이 1¢ 미만이라
--             cent floor 가 예산 가드의 선형성을 깬다.

create table public.ai_cost_log (
  month date not null,
  scope text not null check (scope in ('prod','test')),
  total_micros bigint not null default 0 check (total_micros >= 0),
  updated_at timestamptz not null default now(),
  primary key (month, scope)
);

alter table public.ai_cost_log enable row level security;
-- RLS 정책 없음 = service_role 외 deny.

create or replace function public.add_ai_cost(p_micros int, p_scope text)
returns bigint
language plpgsql
security definer
set search_path = public as $$
declare
  v_month date := date_trunc('month', now() at time zone 'utc')::date;
  v_total bigint;
begin
  if p_micros < 0 then
    raise exception 'p_micros must be >= 0';
  end if;
  if p_scope not in ('prod','test') then
    raise exception 'p_scope must be prod or test';
  end if;

  insert into public.ai_cost_log (month, scope, total_micros, updated_at)
    values (v_month, p_scope, p_micros, now())
    on conflict (month, scope) do update
      set total_micros = public.ai_cost_log.total_micros + excluded.total_micros,
          updated_at = now();

  select total_micros into v_total
    from public.ai_cost_log
    where month = v_month and scope = p_scope;
  return v_total;
end;
$$;

revoke all on function public.add_ai_cost(int, text) from public, anon, authenticated;
grant execute on function public.add_ai_cost(int, text) to service_role;

-- truncate_test_data 덮어쓰기:
--   1) scope='test' 행만 0 리셋 (prod 누적 보호)
--   2) user_id=null 인 events 도 정리 (track() 의 anon 이벤트 누수 방지)
create or replace function public.truncate_test_data()
returns void
language plpgsql security definer
set search_path = public as $$
declare
  v_test_user_ids uuid[];
begin
  select coalesce(array_agg(id), array[]::uuid[]) into v_test_user_ids
    from auth.users where email like '%@test.local';

  if array_length(v_test_user_ids, 1) is not null then
    delete from public.kudos where user_id = any(v_test_user_ids);
    delete from public.action_logs where user_id = any(v_test_user_ids);
    delete from public.challenge_participants where user_id = any(v_test_user_ids);
    delete from public.challenges where group_id in (
      select id from public.groups where owner_id = any(v_test_user_ids)
    );
    delete from public.invites where created_by = any(v_test_user_ids);
    delete from public.group_members where user_id = any(v_test_user_ids);
    delete from public.groups where owner_id = any(v_test_user_ids);
    delete from public.push_subscriptions where user_id = any(v_test_user_ids);
    delete from public.events where user_id = any(v_test_user_ids);
    delete from auth.users where id = any(v_test_user_ids);
  end if;

  -- anon (user_id IS NULL) events 중 최근 24h 것만 정리.
  -- 기존 prod 분석 데이터(더 오래된) 보호. test 가 매 run 마다 찍는 anon event 만 타깃.
  delete from public.events
    where user_id is null
      and created_at > now() - interval '24 hours';

  -- scope='test' 의 현재 월 누적만 리셋. prod 는 건드리지 않음.
  update public.ai_cost_log
    set total_micros = 0, updated_at = now()
    where month = date_trunc('month', now() at time zone 'utc')::date
      and scope = 'test';
end;
$$;

revoke all on function public.truncate_test_data() from public, anon, authenticated;
grant execute on function public.truncate_test_data() to service_role;

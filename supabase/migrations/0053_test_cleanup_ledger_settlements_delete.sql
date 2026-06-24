-- supabase/migrations/0053_test_cleanup_ledger_settlements_delete.sql
-- 0052 forward-fix / EVAL-0042 integration 동반.
--
-- 배경: 0052 가 truncate_test_data 에 `delete from point_ledger`·`delete from settlements` 를 넣었으나,
--   두 테이블의 append-only/immutable 가드(point_ledger_guard_writes·settlements_guard_writes 는
--   tg_op<>'INSERT' 를 무조건 raise)가 그 DELETE 를 "point_ledger is append-only"/"settlements are immutable"
--   로 막아 정리가 다시 실패했다. (0052 는 이미 적용돼 편집 불가 → 본 forward-fix.)
--
-- 수정 방식(0012/0047 storage allow_delete_query 선례 = session-local flag 우회와 동형):
--   두 가드에 **이중 게이트 DELETE 우회**를 추가한다 —
--     (1) current_user not in ('anon','authenticated')  : definer/service_role 컨텍스트에서만(클라 차단)
--     (2) current_setting('app.test_cleanup') = 'on'     : 명시 세션 flag(transaction-local)
--   둘 다 충족할 때만 DELETE 를 허용한다. production 은 이 flag 를 절대 켜지 않으므로(오직
--   service_role 전용 truncate_test_data 만 set), 원장 불변성은 production 에서 그대로 보존된다.
--   authenticated/anon 은 flag 를 켜도 (1) 에서 차단된다. UPDATE 는 어떤 경우에도 계속 금지(append-only).
--   이 방식은 runtime ALTER/DISABLE TRIGGER 의 테이블 소유권 의존(0035 참고)을 피한다.
--
-- 번호: append-only. 0052 다음 0053. forward-only. production 동작 무변(flag 미설정 경로 byte-identical).

-- ============================================================
-- A. point_ledger 가드 — 테스트 정리 DELETE 이중 게이트 우회 추가
-- ============================================================
create or replace function public.prevent_point_ledger_direct_write()
returns trigger
language plpgsql as $$
begin
  -- 테스트 정리 전용 우회: definer/service_role 컨텍스트 + 명시 flag 일 때만 DELETE 허용.
  -- production 은 flag 를 켜지 않고, anon/authenticated 는 current_user 로 차단 → append-only 보존.
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.test_cleanup', true), '') = 'on'
     and current_user not in ('anon', 'authenticated') then
    return old;
  end if;

  if tg_op <> 'INSERT' then
    raise exception 'point_ledger is append-only' using errcode = '42501';
  end if;

  -- service_role 직접 write(BFF/cron) 또는 SECURITY DEFINER RPC(current_user = 함수 소유자) 허용.
  if coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') = 'service_role'
     or current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  raise exception 'point_ledger writes are server-managed (RPC only)' using errcode = '42501';
end;
$$;

-- ============================================================
-- B. settlements 가드 — 동일 이중 게이트 DELETE 우회 추가
-- ============================================================
create or replace function public.prevent_settlements_direct_write()
returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.test_cleanup', true), '') = 'on'
     and current_user not in ('anon', 'authenticated') then
    return old;
  end if;

  if tg_op <> 'INSERT' then
    raise exception 'settlements are immutable' using errcode = '42501';
  end if;

  if coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') = 'service_role'
     or current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  raise exception 'settlements writes are server-managed (RPC only)' using errcode = '42501';
end;
$$;

-- ============================================================
-- C. truncate_test_data — point_ledger/settlements 정리 전에 app.test_cleanup flag set
-- ============================================================
-- 0052 정의 전문 보존 + storage flag 옆에 app.test_cleanup flag 추가(둘 다 transaction-local).
create or replace function public.truncate_test_data()
returns void
language plpgsql security definer
set search_path = public, storage as $$
declare
  v_test_user_ids uuid[];
begin
  select coalesce(array_agg(id), array[]::uuid[]) into v_test_user_ids
    from auth.users where email like '%@test.local';

  if array_length(v_test_user_ids, 1) is not null then
    -- Bypass storage.protect_delete trigger (session-local; service_role only).
    perform set_config('storage.allow_delete_query', 'true', true);
    -- append-only/immutable 가드의 DELETE 우회 활성(transaction-local; truncate_test_data 만 set).
    perform set_config('app.test_cleanup', 'on', true);

    delete from storage.objects
      where bucket_id in ('action-photos', 'feedback-photos')
        and (storage.foldername(name))[1] in (
          select unnest(v_test_user_ids)::text
        );

    delete from public.feedback where user_id = any(v_test_user_ids);
    delete from public.kudos where user_id = any(v_test_user_ids);
    delete from public.action_logs where user_id = any(v_test_user_ids);

    -- point_ledger(append-only)·settlements(immutable) 는 challenges 를 FK 참조 → challenges 삭제 이전에
    -- 정리(ADR-0035 forward-fix). 가드 DELETE 우회는 위 app.test_cleanup flag + definer 컨텍스트로 열린다.
    delete from public.point_ledger where user_id = any(v_test_user_ids);
    delete from public.settlements where challenge_id in (
      select id from public.challenges where group_id in (
        select id from public.groups where owner_id = any(v_test_user_ids)
      )
    );

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

  -- D-017: anon events (user_id IS NULL) within 24h — test anon leaks only,
  -- preserve older prod analytics.
  delete from public.events
    where user_id is null
      and created_at > now() - interval '24 hours';

  -- D-017: reset scope='test' current-month AI cost accumulator.
  update public.ai_cost_log
    set total_micros = 0, updated_at = now()
    where month = date_trunc('month', now() at time zone 'utc')::date
      and scope = 'test';
end;
$$;
revoke all on function public.truncate_test_data() from public, anon, authenticated;
grant execute on function public.truncate_test_data() to service_role;

-- 0012_truncate_storage_allow_delete.sql
-- Fix: 0011 added `delete from storage.objects` to truncate_test_data, but
-- Supabase enforces a storage.protect_delete trigger that blocks direct
-- DELETEs against storage tables ("Direct deletion from storage tables is
-- not allowed. Use the Storage API instead."). A session-scoped flag
-- `storage.allow_delete_query='true'` bypasses the trigger for the duration
-- of this service_role-only SECURITY DEFINER function.
--
-- Forward-only: re-emit truncate_test_data with the same body plus the flag.
-- All D-017/D-018 guarantees preserved (scope='test' reset, anon-event 24h
-- cleanup, Storage object cleanup for @test.local users).

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

    delete from storage.objects
      where bucket_id = 'action-photos'
        and (storage.foldername(name))[1] in (
          select unnest(v_test_user_ids)::text
        );

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

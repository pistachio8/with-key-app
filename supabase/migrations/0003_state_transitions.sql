-- 0003_state_transitions.sql — 원자적 상태 전이 + 테스트 헬퍼.

-- ============================================================
-- sign_and_maybe_activate
-- 마지막 서명자 action 에서 호출. 호출자 = auth.uid() 서명 기록 후
-- 전원 서명이면 status→active + start/end 파생.
-- ============================================================
create or replace function public.sign_and_maybe_activate(p_challenge_id uuid)
returns table (status text, start_at timestamptz, end_at timestamptz)
language plpgsql security invoker
set search_path = public as $$
declare
  v_unsigned_count int;
  v_duration_days int;
  v_is_participant boolean;
begin
  select exists(
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = auth.uid()
  ) into v_is_participant;
  if not v_is_participant then
    raise exception 'not a participant' using errcode = '42501';
  end if;

  update public.challenge_participants
    set signed_at = coalesce(signed_at, now())
    where challenge_id = p_challenge_id and user_id = auth.uid();

  select count(*) into v_unsigned_count
    from public.challenge_participants
    where challenge_id = p_challenge_id and signed_at is null;

  if v_unsigned_count = 0 then
    select duration_days into v_duration_days from public.challenges
      where id = p_challenge_id for update;
    update public.challenges
      set status = 'active',
          start_at = now(),
          end_at = now() + make_interval(days => v_duration_days)
      where id = p_challenge_id and status in ('pending','accepted');
  end if;

  return query
    select c.status, c.start_at, c.end_at
      from public.challenges c where c.id = p_challenge_id;
end;
$$;

-- ============================================================
-- truncate_test_data — integration test 전용. service_role 만.
-- Scoped: @test.local 유저 소유 데이터만 삭제 (실데이터 보호).
-- ============================================================
create or replace function public.truncate_test_data()
returns void
language plpgsql security definer
set search_path = public as $$
declare
  v_test_user_ids uuid[];
begin
  -- 1) @test.local 유저 id 수집
  select coalesce(array_agg(id), array[]::uuid[]) into v_test_user_ids
    from auth.users where email like '%@test.local';

  if array_length(v_test_user_ids, 1) is null then
    return;
  end if;

  -- 2) 이들이 소유한 도메인 데이터 삭제. CASCADE FK 를 활용.
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

  -- 3) auth.users 삭제 → public.users 는 FK cascade 로 제거.
  delete from auth.users where id = any(v_test_user_ids);
end;
$$;

revoke all on function public.truncate_test_data() from public, anon, authenticated;
grant execute on function public.truncate_test_data() to service_role;

-- 0006_rpc_activate_via_definer.sql — sign_and_maybe_activate 를 security definer 로.
--
-- 문제:
--   security invoker + challenges UPDATE 정책(owner only) 때문에, 마지막 서명자가
--   owner 가 아니면 status 전이 UPDATE 가 조용히 RLS 에 걸려 효과 없음.
-- 해결:
--   함수를 security definer 로 바꾸고, 내부에서 auth.uid() 로 참가자 여부를
--   명시 검사. RLS 는 participant scope 로 이미 우회되므로 상태 전이 실행 OK.
--   보안 경계:
--     - 참가자 체크(v_is_participant) 를 먼저.
--     - signed_at 은 자기 자신만 업데이트.
--     - status 전이는 전원 서명 시점에만.

create or replace function public.sign_and_maybe_activate(p_challenge_id uuid)
returns table (status text, start_at timestamptz, end_at timestamptz)
language plpgsql security definer
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
    select duration_days into v_duration_days from public.challenges c
      where c.id = p_challenge_id for update;
    update public.challenges c
      set status = 'active',
          start_at = now(),
          end_at = now() + make_interval(days => v_duration_days)
      where c.id = p_challenge_id and c.status in ('pending','accepted');
  end if;

  return query
    select c.status, c.start_at, c.end_at
      from public.challenges c where c.id = p_challenge_id;
end;
$$;

-- 참가자만 호출 가능: authenticated + service_role 만. anon 차단.
revoke all on function public.sign_and_maybe_activate(uuid) from public, anon;
grant execute on function public.sign_and_maybe_activate(uuid) to authenticated, service_role;

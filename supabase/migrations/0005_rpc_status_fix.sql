-- 0005_rpc_status_fix.sql — sign_and_maybe_activate 의 "status" 컬럼 ambiguity 제거.
-- RETURNS TABLE 의 OUT 이름과 public.challenges.status 컬럼 충돌 → alias 로 명확화.

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

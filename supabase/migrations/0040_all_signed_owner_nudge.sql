-- 0040_all_signed_owner_nudge.sql
--
-- Decision: ADR-0028 — 전원 서명 완료 시 오너에게 시작 nudge(자동 시작 아님).
--
--   sign_and_maybe_activate 는 서명만 기록하던 것을 유지하되(ADR-0009: 자동 활성화 없음),
--   서명 직후 "전원 서명 && 참가자>=2 && 마지막 서명자가 오너 아님" 을 atomic 판정해
--   should_nudge_owner 를 반환한다. 중복 발송은 challenges.start_nudge_sent_at +
--   challenge row 의 for update lock 으로 정확히 1회 보장.
--
--   start_challenge_with_signed_participants(0039) 는 건드리지 않는다 — D-day 작업과 분리.
--   forward-only(down 없음).

alter table public.challenges
  add column if not exists start_nudge_sent_at timestamptz;

-- 반환 시그니처가 바뀌므로 create or replace 불가 → drop 후 재생성(0028 패턴).
drop function if exists public.sign_and_maybe_activate(uuid);

create function public.sign_and_maybe_activate(p_challenge_id uuid)
returns table (
  status text,
  start_at timestamptz,
  end_at timestamptz,
  participant_count int,
  challenge_created_at timestamptz,
  signed_count int,
  owner_user_id uuid,
  should_nudge_owner boolean
)
language plpgsql security definer
set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_is_participant boolean;
  v_total int;
  v_signed int;
  v_should_nudge boolean := false;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  -- challenge row 를 lock 해 동시 서명 직렬화(nudge atomic 보장) + owner 조회.
  select g.owner_id into v_owner
    from public.challenges c
    join public.groups g on g.id = c.group_id
    where c.id = p_challenge_id
      and c.status in ('pending','accepted')
    for update of c;

  if not found then
    raise exception 'not a pending challenge' using errcode = '42501';
  end if;

  select exists(
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = v_uid
  ) into v_is_participant;

  if not v_is_participant then
    raise exception 'not a participant' using errcode = '42501';
  end if;

  -- 서명 기록(멱등 — 이미 서명했으면 timestamp 유지).
  update public.challenge_participants
    set signed_at = coalesce(signed_at, now())
    where challenge_id = p_challenge_id and user_id = v_uid;

  select
    count(*)::int,
    count(*) filter (where signed_at is not null)::int
    into v_total, v_signed
    from public.challenge_participants
    where challenge_id = p_challenge_id;

  -- nudge 판정: 전원 서명 + 참가자>=2 + 마지막 서명자가 오너 아님.
  -- start_nudge_sent_at IS NULL 일 때만 set → 정확히 1회(row 는 위에서 lock 중).
  if v_signed = v_total and v_total >= 2 and v_uid <> v_owner then
    update public.challenges
      set start_nudge_sent_at = now()
      where id = p_challenge_id and start_nudge_sent_at is null;
    if found then
      v_should_nudge := true;
    end if;
  end if;

  return query
    select
      c.status,
      c.start_at,
      c.end_at,
      v_total,
      c.created_at,
      v_signed,
      v_owner,
      v_should_nudge
    from public.challenges c
    where c.id = p_challenge_id;
end;
$$;

revoke all on function public.sign_and_maybe_activate(uuid) from public, anon;
grant execute on function public.sign_and_maybe_activate(uuid) to authenticated, service_role;

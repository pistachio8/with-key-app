-- 0028_pending_invite_start_flow.sql
--
-- Decision:
--   pending = invitation/signature window, active = fixed challenge cohort.
--   Signing no longer activates the challenge automatically. The owner starts
--   with the signed participants explicitly.

-- Backward-compatible name: callers still use sign_and_maybe_activate, but the
-- function now only records the caller's signature while the challenge is
-- pending/accepted.
drop function if exists public.sign_and_maybe_activate(uuid);

create function public.sign_and_maybe_activate(p_challenge_id uuid)
returns table (
  status text,
  start_at timestamptz,
  end_at timestamptz,
  participant_count int,
  challenge_created_at timestamptz
)
language plpgsql security definer
set search_path = public as $$
declare
  v_is_participant boolean;
begin
  select exists(
    select 1
      from public.challenge_participants cp
      join public.challenges c on c.id = cp.challenge_id
      where cp.challenge_id = p_challenge_id
        and cp.user_id = auth.uid()
        and c.status in ('pending','accepted')
  ) into v_is_participant;

  if not v_is_participant then
    raise exception 'not a pending participant' using errcode = '42501';
  end if;

  update public.challenge_participants
    set signed_at = coalesce(signed_at, now())
    where challenge_id = p_challenge_id and user_id = auth.uid();

  return query
    select
      c.status,
      c.start_at,
      c.end_at,
      (select count(*)::int from public.challenge_participants cp
         where cp.challenge_id = c.id),
      c.created_at
    from public.challenges c
    where c.id = p_challenge_id;
end;
$$;

revoke all on function public.sign_and_maybe_activate(uuid) from public, anon;
grant execute on function public.sign_and_maybe_activate(uuid) to authenticated, service_role;

create or replace function public.start_challenge_with_signed_participants(p_challenge_id uuid)
returns table (
  status text,
  start_at timestamptz,
  end_at timestamptz,
  participant_count int,
  challenge_created_at timestamptz
)
language plpgsql security definer
set search_path = public as $$
declare
  v_uid uuid;
  v_duration_days int;
  v_signed_count int;
  v_owner_signed boolean;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  select c.duration_days into v_duration_days
    from public.challenges c
    join public.groups g on g.id = c.group_id
    where c.id = p_challenge_id
      and g.owner_id = v_uid
      and c.status in ('pending','accepted')
    for update of c;

  if not found then
    raise exception 'not challenge owner or not startable' using errcode = '42501';
  end if;

  select count(*)::int into v_signed_count
    from public.challenge_participants
    where challenge_id = p_challenge_id
      and signed_at is not null;

  select exists(
    select 1
      from public.challenge_participants
      where challenge_id = p_challenge_id
        and user_id = v_uid
        and signed_at is not null
  ) into v_owner_signed;

  if v_signed_count < 1 or not v_owner_signed then
    raise exception 'no signed owner participant' using errcode = '42501';
  end if;

  -- Freeze the active cohort: unsigned invitees remain group members, but start
  -- with the next challenge.
  delete from public.challenge_participants
    where challenge_id = p_challenge_id
      and signed_at is null;

  update public.challenges c
    set status = 'active',
        start_at = now(),
        end_at = now() + make_interval(days => v_duration_days)
    where c.id = p_challenge_id;

  return query
    select
      c.status,
      c.start_at,
      c.end_at,
      (select count(*)::int from public.challenge_participants cp
         where cp.challenge_id = c.id),
      c.created_at
    from public.challenges c
    where c.id = p_challenge_id;
end;
$$;

revoke all on function public.start_challenge_with_signed_participants(uuid) from public, anon;
grant execute on function public.start_challenge_with_signed_participants(uuid)
  to authenticated, service_role;

create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql security definer
set search_path = public as $$
declare
  v_uid uuid;
  v_invite record;
  v_member_count int;
  v_already_member boolean;
  v_pending_challenge_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  if p_token is null or char_length(p_token) < 1 then
    raise exception 'invalid invite token' using errcode = '22023';
  end if;

  select id, group_id, expires_at
    into v_invite
    from public.invites
    where token = p_token;

  if not found then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;

  if v_invite.expires_at <= now() then
    raise exception 'invite expired' using errcode = 'P0002';
  end if;

  select exists(
    select 1 from public.group_members
    where group_id = v_invite.group_id and user_id = v_uid
  ) into v_already_member;

  if not v_already_member then
    select count(*) into v_member_count
      from public.group_members
      where group_id = v_invite.group_id;

    -- PRD §3.3 AC-4: 그룹 멤버 3~4명. 5명째 차단.
    if v_member_count >= 4 then
      raise exception 'group full' using errcode = '42501';
    end if;

    insert into public.group_members (group_id, user_id, role)
      values (v_invite.group_id, v_uid, 'member');
  end if;

  -- pending 챌린지가 있으면 신규/기존 그룹 멤버 모두 현재 서약서에 편입한다.
  -- active 이후는 freeze: 그룹 멤버로만 합류하고 다음 챌린지부터 함께한다.
  select id into v_pending_challenge_id
    from public.challenges
    where group_id = v_invite.group_id
      and status = 'pending'
    order by created_at desc
    limit 1;

  if v_pending_challenge_id is not null then
    insert into public.challenge_participants (challenge_id, user_id)
      values (v_pending_challenge_id, v_uid)
      on conflict (challenge_id, user_id) do nothing;
  end if;

  return v_invite.group_id;
end;
$$;

revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated, service_role;

drop policy if exists al_insert_self_active on public.action_logs;

create policy al_insert_self_active on public.action_logs
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.challenges c
      where c.id = challenge_id
        and c.status = 'active'
        and now() between c.start_at and c.end_at
    )
    and exists (
      select 1 from public.challenge_participants cp
      where cp.challenge_id = challenge_id
        and cp.user_id = auth.uid()
    )
  );

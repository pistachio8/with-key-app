-- 0018_accept_invite_rpc.sql
--
-- 목적 (PRD §3.3 AC-3/AC-4 · BE_SCHEMA §8.3):
--   초대 토큰으로 로그인된 유저를 그룹에 편입한다.
--   group_members INSERT 가 RLS 상 service_role-only (0002_rls.sql 기준) 이므로
--   SECURITY DEFINER RPC 로 토큰 검증 + 멤버 편입 + pending 챌린지 참가자 편입을
--   단일 트랜잭션으로 수행한다.
--
--   반환: 참여한 group_id (uuid).
--   실패 SQLSTATE:
--     42501  auth 필요 / 4명 초과 (forbidden)
--     22023  토큰 형식 오류 (invalid_input)
--     P0002  토큰이 존재하지 않거나 만료됨 (NOT FOUND → not_found)
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

    -- pending 챌린지가 있으면 참가자로 편입 (active 이후는 freeze — PRD AC-6).
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
  end if;

  return v_invite.group_id;
end;
$$;

revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated, service_role;

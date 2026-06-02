-- 0021_create_challenge_rpc.sql
--
-- 목적 (BE_SCHEMA §8.1):
--   createChallenge Server Action 이 challenges row 만 삽입하고
--   challenge_participants 시드를 누락하던 버그 수정.
--   challenge_participants INSERT 는 0002_rls.sql 기준 service_role-only 라
--   유저 토큰으로 직접 insert 불가 → SECURITY DEFINER RPC 로 한 트랜잭션 처리.
--
--   1) 신규 RPC `create_challenge(p_group_id, p_title, p_type, p_goal_count,
--                                  p_duration_days, p_penalty_amount)`
--      - owner 검증 → challenges insert → challenge_participants 전 group_members 시드
--      - 반환: (id uuid, participant_count int)
--        participant_count 는 시드 후 카운트 — PR-2 의 challenge_created /
--        challenge_activated 이벤트 props 와 cohort 분리에 사용.
--
--   2) 기존 pending 챌린지 백필 (멱등):
--      배포 이전 owner 시드 없이 생성된 챌린지가 있을 경우, group_members 전원을
--      ON CONFLICT DO NOTHING 으로 채운다. 영향 row 가 0건이면 no-op.
--
--   보안 경계:
--     - auth.uid() null 차단 (42501)
--     - groups.owner_id = auth.uid() 검증 (42501)
--     - p_group_id 존재 검증 (P0002)
--     - 컬럼 CHECK 는 테이블 정의에 위임 (title 1~30 · goal_count 1~7 ·
--       duration_days 1~90 · penalty_amount 1000~10000 1천단위)

create or replace function public.create_challenge(
  p_group_id uuid,
  p_title text,
  p_type text,
  p_goal_count int,
  p_duration_days int,
  p_penalty_amount int
)
returns table (id uuid, participant_count int)
language plpgsql security definer
set search_path = public as $$
declare
  v_uid uuid;
  v_owner_id uuid;
  v_challenge_id uuid;
  v_count int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  select owner_id into v_owner_id from public.groups where id = p_group_id;
  if not found then
    raise exception 'group not found' using errcode = 'P0002';
  end if;
  if v_owner_id <> v_uid then
    raise exception 'not group owner' using errcode = '42501';
  end if;

  insert into public.challenges (
    group_id, title, type, goal_count, duration_days, penalty_amount
  )
  values (
    p_group_id, p_title, p_type, p_goal_count, p_duration_days, p_penalty_amount
  )
  returning challenges.id into v_challenge_id;

  -- 시드: 현재 그룹 멤버 전원 (signed_at = null 미서명 상태).
  insert into public.challenge_participants (challenge_id, user_id)
  select v_challenge_id, gm.user_id
    from public.group_members gm
    where gm.group_id = p_group_id
  on conflict (challenge_id, user_id) do nothing;

  select count(*)::int into v_count
    from public.challenge_participants
    where challenge_id = v_challenge_id;

  return query select v_challenge_id, v_count;
end;
$$;

revoke all on function public.create_challenge(uuid, text, text, int, int, int)
  from public, anon;
grant execute on function public.create_challenge(uuid, text, text, int, int, int)
  to authenticated, service_role;

-- 백필: 0021 이전에 owner 누락된 채로 생성된 pending 챌린지 보정.
-- 멱등 — ON CONFLICT DO NOTHING. 0건이면 no-op.
--
-- 정책: pending 만 대상 (active/closed 챌린지는 freeze, AC-6).
-- 시드 대상: 해당 챌린지의 그룹 전체 group_members (Q2 결정).
insert into public.challenge_participants (challenge_id, user_id)
select c.id, gm.user_id
  from public.challenges c
  join public.group_members gm on gm.group_id = c.group_id
  where c.status = 'pending'
on conflict (challenge_id, user_id) do nothing;

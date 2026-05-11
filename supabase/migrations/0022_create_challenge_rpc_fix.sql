-- 0022_create_challenge_rpc_fix.sql
--
-- 0021 의 create_challenge RPC 가 PostgreSQL 42702 ("column reference 'id' is
-- ambiguous") 로 실패하는 버그 수정.
--
-- 원인:
--   `RETURNS TABLE (id uuid, participant_count int)` 가 PL/pgSQL 내부에서 OUT
--   파라미터 `id` 를 자동 생성. 함수 본문의 `RETURNING challenges.id INTO
--   v_challenge_id` 가 테이블 column 과 OUT 파라미터 사이에서 모호하게 해석되어
--   런타임에 42702 raise. integration 테스트는 `.from('challenges').insert()`
--   직접 호출이라 이 분기를 타지 않아 발견되지 않음 → e2e 에서만 노출.
--
-- 수정:
--   `#variable_conflict use_column` 디렉티브로 모호 시 column 해석 우선. RETURNS
--   시그너처 동일하므로 CREATE OR REPLACE 로 본문만 갱신.

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
#variable_conflict use_column
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
    where challenge_participants.challenge_id = v_challenge_id;

  return query select v_challenge_id, v_count;
end;
$$;

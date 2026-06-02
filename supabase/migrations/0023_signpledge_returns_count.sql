-- 0022_signpledge_returns_count.sql
--
-- 목적 (PR-2 — 솔로 챌린지 정식 모드):
--   sign_and_maybe_activate RPC 의 반환 컬럼을 확장해 후속 이벤트 발화에
--   필요한 데이터를 한 트랜잭션 안에서 함께 반환한다.
--
--   - participant_count int: 코호트 분리(솔로 1 / 그룹 ≥2)와 challenge_activated
--                            이벤트 props 에 사용. AC-6 freeze 로 active 전이
--                            이후 변하지 않으므로 시점 정확.
--   - challenge_created_at timestamptz: signToActiveMs 계산용
--                            (= now() - created_at, J-2(a) 결정).
--
--   기존 컬럼(status / start_at / end_at) 는 그대로 유지 — pledge/_actions.ts
--   기존 매핑 호환.
--
--   주의: Postgres `CREATE OR REPLACE FUNCTION` 으로는 RETURNS TABLE 컬럼 변경
--         불가 → DROP + CREATE 패턴. 함수 본문은 0006_rpc_activate_via_definer.sql
--         과 동일하고, 반환 query 만 컬럼 2개 추가.
--
--   스키마/RLS/인덱스 변경 없음.

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

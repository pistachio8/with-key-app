-- 0039_challenge_end_at_kst_midnight.sql
--
-- Decision: ADR-0026 — 챌린지 종료 경계를 KST(Asia/Seoul) 자정으로 정렬.
--
--   기존: end_at = now() + make_interval(days => duration_days)
--         → 활성화 시각으로부터 24h 배수. 진행 일수(done-days.ts 의 KST 자정
--           캘린더 기준)와 어긋나 (a) "N일차인데 D-N 불일치", (b) 마지막 날 다음
--           오전 KST 에 제출은 되지만 day-index>duration_days 라 카운트 안 되는
--           dead zone 을 만들었다.
--
--   변경: end_at = (활성화 KST 날짜 + duration_days)일의 00:00 KST.
--         start_at(=now()) 은 그대로 — 활성화된 KST 날짜가 1일차(부분일 가능).
--         게이트(now < end_at)·RLS(now between start_at and end_at)가 KST 자정에
--         정확히 닫혀 dead zone 이 소멸하고, 표시 ceil 공식도 자동으로 정확해진다.
--
--   범위: end_at 을 세팅(=활성화)하는 함수는 현재
--         start_challenge_with_signed_participants 하나뿐 (sign_and_maybe_activate
--         는 0028 에서 서명만 기록). 신규 활성화부터 적용 — 기존 active 행은
--         backfill 하지 않는다(ADR-0026 대안 3). 시그니처 불변 → create or replace.
--
--   스키마/RLS/인덱스 변경 없음. forward-only(down 없음).

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

  -- ADR-0026: end_at = (활성화 KST 날짜 + duration_days)일의 00:00 KST.
  -- now() at time zone 'Asia/Seoul' → KST wall-clock(naive) 로 변환 후 date_trunc
  -- 로 KST 자정, +duration_days, 다시 at time zone 'Asia/Seoul' 로 timestamptz 화.
  update public.challenges c
    set status = 'active',
        start_at = now(),
        end_at = (
          date_trunc('day', now() at time zone 'Asia/Seoul')
          + make_interval(days => v_duration_days)
        ) at time zone 'Asia/Seoul'
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

-- supabase/migrations/0044_settlement_rpcs.sql
-- ADR-0032 / EVAL-0006 (WP2) — 정산·보증금 금전성 write 를 SECURITY DEFINER RPC 한 경로로 닫는다.
-- spec: docs/superpowers/specs/2026-06-08-settlement-rpc-ledger.md (RPC 시그니처 + 원장 sign 규약).
--
-- 미달분(confirmedPenalty) 산식은 apps/web/src/lib/challenge/weekly.ts 를 SQL 로 포팅했고,
-- 분배 sign 규약은 packages/domain/src/settlement.ts(computeSettlement)와 1:1 미러다.
--
-- production apply 는 G2(ⓑ적립 포인트 법무 검토) 통과 전 보류 — 본 migration 의 결정론 불변식
-- (이중정산 no-op·잔액=Σdelta)은 게이트 무관(ADR-0032 §게이트 경계).

-- ============================================================
-- A. 가드 트리거 보강 — SECURITY DEFINER RPC 경로 허용
-- ============================================================
-- 0042/0043 의 가드는 `request.jwt.claims->>'role' = 'service_role'` 만 허용했다. 그러나
-- SECURITY DEFINER 함수는 request.jwt.claims(GUC)를 바꾸지 않으므로, authenticated 그룹장이
-- settle_challenge(settled_by='owner')를 호출하면 가드가 원장 INSERT 를 42501 로 막아버린다.
--
-- definer 함수 안에서 실행되는 문장은 함수 소유자(postgres)로 돌기 때문에 트리거 시점의
-- current_user 가 'postgres'(= anon/authenticated 가 아님)다. 직접 클라 write 는 current_user 가
-- 'anon'/'authenticated'. 이 차이로 "definer RPC 통과 / 직접 클라 차단"을 환경 무관하게 가른다.
-- (RLS 는 point_ledger·settlements 에 write 정책이 없어 직접 클라 write 를 이미 deny — 본 가드는
--  service_role 직접 write[BFF/cron]를 허용하면서도 definer RPC 를 함께 허용하는 2차 방어선.)

create or replace function public.prevent_point_ledger_direct_write()
returns trigger
language plpgsql as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'point_ledger is append-only' using errcode = '42501';
  end if;

  -- service_role 직접 write(BFF/cron) 또는 SECURITY DEFINER RPC(current_user = 함수 소유자) 허용.
  if coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') = 'service_role'
     or current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  raise exception 'point_ledger writes are server-managed (RPC only)' using errcode = '42501';
end;
$$;

create or replace function public.prevent_settlements_direct_write()
returns trigger
language plpgsql as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'settlements are immutable' using errcode = '42501';
  end if;

  if coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') = 'service_role'
     or current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  raise exception 'settlements writes are server-managed (RPC only)' using errcode = '42501';
end;
$$;

create or replace function public.prevent_challenge_participants_deposit_points_write()
returns trigger
language plpgsql as $$
declare
  v_allowed boolean;
begin
  v_allowed :=
    coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') = 'service_role'
    or current_user not in ('anon', 'authenticated');

  if tg_op = 'INSERT' then
    if coalesce(new.deposit_points, 0) <> 0 and not v_allowed then
      raise exception 'challenge_participants.deposit_points is server-managed'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.deposit_points is distinct from old.deposit_points and not v_allowed then
    raise exception 'challenge_participants.deposit_points is server-managed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ============================================================
-- B. 잔액 read — 잔액 = Σdelta (balance 컬럼 참조 금지, AC-deposit-hold-5)
-- ============================================================
-- SECURITY INVOKER: RLS(point_ledger_select_self_or_group)가 본인·그룹 멤버 read 를 허용하므로
-- 호출자 권한으로 집계한다. RPC 내부 잔액 검증(hold_deposit)에서도 재사용.
create or replace function public.point_balance(p_user_id uuid, p_group_id uuid)
returns integer
language sql stable security invoker
set search_path = public as $$
  select coalesce(sum(delta), 0)::integer
  from public.point_ledger
  where user_id = p_user_id and group_id = p_group_id;
$$;

-- ============================================================
-- C. 주 단위 미달분(confirmedPenalty) 산정 — weekly.ts 포팅
-- ============================================================
-- 끝난 주(cutoff 안에 완전히 들어온 주)만 합산. binary 아님(AC-settle-4).
-- cutoff: closed_at 있으면 min(duration_days, dayIndexOf(closed_at)), 없으면 duration_days(자연 종료 폴백).
-- 자투리(마지막) 주 목표만 일수 비례 올림, 그 외 full week 는 goal_count 그대로.
create or replace function public._settlement_confirmed_penalties(p_challenge_id uuid)
returns table (user_id uuid, confirmed_penalty integer)
language sql stable security definer
set search_path = public as $$
  with ch as (
    select
      c.duration_days,
      c.goal_count,
      c.penalty_amount,
      (c.start_at at time zone 'Asia/Seoul')::date as start_day,
      ceil(c.duration_days::numeric / 7)::int as total_weeks,
      case
        when c.closed_at is not null then
          least(
            c.duration_days,
            (((c.closed_at at time zone 'Asia/Seoul')::date - (c.start_at at time zone 'Asia/Seoul')::date) + 1)
          )
        else c.duration_days
      end as cutoff_day
    from public.challenges c
    where c.id = p_challenge_id
  ),
  elapsed_weeks as (
    -- 끝까지 진행된 주 + 그 주의 목표(자투리 ceil 비례)
    select
      w.week,
      case
        when w.week < ch.total_weeks or ch.duration_days % 7 = 0 then ch.goal_count
        else ceil(ch.goal_count::numeric * (ch.duration_days - (ch.total_weeks - 1) * 7) / 7)::int
      end as week_goal
    from ch
    cross join lateral generate_series(1, ch.total_weeks) as w(week)
    where least(w.week * 7, ch.duration_days) <= ch.cutoff_day
  ),
  participants as (
    select cp.user_id
    from public.challenge_participants cp
    where cp.challenge_id = p_challenge_id and cp.signed_at is not null
  ),
  done_days as (
    -- 하루 N개 인증도 1회(KST distinct day), 범위 밖(stray) 제외
    select distinct
      cp.user_id,
      (al.created_at at time zone 'Asia/Seoul')::date as kst_day
    from public.challenge_participants cp
    join public.action_logs al
      on al.challenge_id = cp.challenge_id and al.user_id = cp.user_id
    cross join ch
    where cp.challenge_id = p_challenge_id
      and cp.signed_at is not null
      and (((al.created_at at time zone 'Asia/Seoul')::date - ch.start_day) + 1)
          between 1 and ch.duration_days
  ),
  done_by_week as (
    -- weekIndexOf(dayIndex) = floor((dayIndex-1)/7)+1, dayIndex-1 = kst_day - start_day
    select
      dd.user_id,
      floor((dd.kst_day - ch.start_day) / 7) + 1 as week,
      count(*) as done
    from done_days dd
    cross join ch
    group by dd.user_id, floor((dd.kst_day - ch.start_day) / 7) + 1
  ),
  per_user_week as (
    select
      p.user_id,
      e.week_goal,
      coalesce(dbw.done, 0) as done
    from participants p
    cross join elapsed_weeks e
    left join done_by_week dbw on dbw.user_id = p.user_id and dbw.week = e.week
  )
  select
    pu.user_id,
    case
      when (select penalty_amount from ch) > 0
        then ((select penalty_amount from ch) * count(*) filter (where pu.done < pu.week_goal))::integer
      else 0
    end as confirmed_penalty
  from per_user_week pu
  group by pu.user_id;
$$;

-- ============================================================
-- D. 정산·보증금 RPC (SECURITY DEFINER) 5종
-- ============================================================

-- D1. grant_bundle_points — 적립/번들 포인트 그랜트. BFF(service_role) 전용.
-- 무상 포인트 발행이라 클라 토큰으로 호출 금지. p_ref_id 로 멱등(중복 그랜트 방지).
create or replace function public.grant_bundle_points(
  p_user_id uuid,
  p_group_id uuid,
  p_amount integer,
  p_ref_id uuid
)
returns void
language plpgsql security definer
set search_path = public as $$
begin
  if coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') <> 'service_role' then
    raise exception 'grant_bundle_points is BFF-only' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'grant amount must be positive' using errcode = '22023';
  end if;

  -- 멱등: 같은 ref_id 그랜트가 있으면 no-op
  if exists (
    select 1 from public.point_ledger
    where reason = 'bundle_grant' and ref_id = p_ref_id and user_id = p_user_id
  ) then
    return;
  end if;

  insert into public.point_ledger (user_id, group_id, challenge_id, delta, reason, ref_id)
  values (p_user_id, p_group_id, null, p_amount, 'bundle_grant', p_ref_id);
end;
$$;

-- D2 의 원자적 멱등 제약: (user, challenge) 당 deposit_hold 1행만 허용.
-- 동시 hold 호출이 함수 내 if-exists 가드를 함께 통과해도 두 번째 INSERT 를 DB 가 거부 →
-- 중복 hold(-2H)로 잔액이 음수로 빠지는 race 를 구조적으로 차단(settle_challenge 의 settlements PK 와 동일 전략).
create unique index if not exists ux_point_ledger_deposit_hold
  on public.point_ledger (user_id, challenge_id)
  where reason = 'deposit_hold';

-- D2. hold_deposit — 서약 시 보증금 hold. 호출자(auth.uid()) 본인 + 서명 참가자만.
-- 잔액 부족 시 차단(AC-deposit-hold-4). (user, challenge) 당 1회 멱등.
create or replace function public.hold_deposit(
  p_challenge_id uuid,
  p_amount integer
)
returns void
language plpgsql security definer
set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_group_id uuid;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'hold amount must be positive' using errcode = '22023';
  end if;

  select c.group_id into v_group_id from public.challenges c where c.id = p_challenge_id;
  if v_group_id is null then
    raise exception 'challenge not found' using errcode = 'P0002';
  end if;

  -- 서명 참가자만 hold
  if not exists (
    select 1 from public.challenge_participants cp
    where cp.challenge_id = p_challenge_id and cp.user_id = v_uid and cp.signed_at is not null
  ) then
    raise exception 'not a signed participant' using errcode = '42501';
  end if;

  -- 멱등: 이미 hold 했으면 no-op
  if exists (
    select 1 from public.point_ledger
    where reason = 'deposit_hold' and challenge_id = p_challenge_id and user_id = v_uid
  ) then
    return;
  end if;

  -- 잔액 부족 차단
  if public.point_balance(v_uid, v_group_id) < p_amount then
    raise exception 'insufficient balance to hold deposit' using errcode = '22023';
  end if;

  -- 원자적 멱등: 위 if-exists 가드를 동시 호출 둘이 함께 통과해도
  -- ux_point_ledger_deposit_hold(partial unique)가 두 번째 INSERT 를 거부 → 중복 hold(-2H) 차단.
  insert into public.point_ledger (user_id, group_id, challenge_id, delta, reason, ref_id)
  values (v_uid, v_group_id, p_challenge_id, -p_amount, 'deposit_hold', p_challenge_id)
  on conflict (user_id, challenge_id) where reason = 'deposit_hold' do nothing;

  if not found then
    return; -- 동시 hold 경쟁에서 짐 → 승자 트랜잭션이 deposit_points 갱신을 담당
  end if;

  update public.challenge_participants
    set deposit_points = p_amount
  where challenge_id = p_challenge_id and user_id = v_uid;
end;
$$;

-- D3. deposit_release — 한 참가자 보증금 전액 환급(단독 경로: 중도 이탈 등).
-- 그룹장 또는 본인만. held 없으면 no-op(멱등).
create or replace function public.deposit_release(
  p_challenge_id uuid,
  p_user_id uuid
)
returns void
language plpgsql security definer
set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '');
  v_group_id uuid;
  v_held integer;
begin
  select c.group_id into v_group_id from public.challenges c where c.id = p_challenge_id;
  if v_group_id is null then
    raise exception 'challenge not found' using errcode = 'P0002';
  end if;

  -- 권한: service_role(cron) 또는 그룹장 또는 본인
  if v_role <> 'service_role'
     and v_uid <> p_user_id
     and not exists (
       select 1 from public.groups g where g.id = v_group_id and g.owner_id = v_uid
     ) then
    raise exception 'only owner or self can release deposit' using errcode = '42501';
  end if;

  select cp.deposit_points into v_held
  from public.challenge_participants cp
  where cp.challenge_id = p_challenge_id and cp.user_id = p_user_id;

  if coalesce(v_held, 0) <= 0 then
    return; -- held 없음 → no-op
  end if;

  insert into public.point_ledger (user_id, group_id, challenge_id, delta, reason, ref_id)
  values (p_user_id, v_group_id, p_challenge_id, v_held, 'deposit_release', p_challenge_id);

  update public.challenge_participants
    set deposit_points = 0
  where challenge_id = p_challenge_id and user_id = p_user_id;
end;
$$;

-- D4. settle_challenge — 정산 확정(멱등). settlements PK + on conflict do nothing 으로 이중정산 차단.
-- settled_by: service_role(cron)=auto, authenticated 그룹장=owner. 그 외 호출 금지.
-- release-full + penalty 규약(packages/domain/settlement.ts 미러): 참가자별
--   deposit_release(+held) → penalty(-min(held, confirmedPenalty)), pool = Σforfeit.
-- 개인↔개인 재분배 원장 행 없음(AC-settle-6) — pool 은 settlements.pool_points 에만 적재.
create or replace function public.settle_challenge(p_challenge_id uuid)
returns void
language plpgsql security definer
set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '');
  v_group_id uuid;
  v_settled_by text;
  v_inserted integer := 0;
  v_pool integer := 0;
  v_distribution jsonb := '{}'::jsonb;
  r record;
  v_forfeit integer;
begin
  select c.group_id into v_group_id from public.challenges c where c.id = p_challenge_id;
  if v_group_id is null then
    raise exception 'challenge not found' using errcode = 'P0002';
  end if;

  if v_role = 'service_role' then
    v_settled_by := 'auto';
  elsif exists (select 1 from public.groups g where g.id = v_group_id and g.owner_id = v_uid) then
    v_settled_by := 'owner';
  else
    raise exception 'only group owner or system can settle' using errcode = '42501';
  end if;

  -- 멱등 게이트: settlements 행이 이미 있으면 0행 → no-op. 클릭+cron 동시에도 정산 1회.
  insert into public.settlements (challenge_id, settled_by, pool_points, distribution)
  values (p_challenge_id, v_settled_by, 0, '{}'::jsonb)
  on conflict (challenge_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return; -- 이미 정산됨 → 추가 원장 0행 (AC-settle-trigger-3)
  end if;

  -- 참가자별 보증금 환급 + 미달분 차감
  for r in
    select
      cp.user_id,
      coalesce(cp.deposit_points, 0) as held,
      coalesce(cpen.confirmed_penalty, 0) as penalty
    from public.challenge_participants cp
    left join public._settlement_confirmed_penalties(p_challenge_id) cpen
      on cpen.user_id = cp.user_id
    where cp.challenge_id = p_challenge_id and cp.signed_at is not null
  loop
    v_forfeit := least(r.held, greatest(r.penalty, 0));

    if r.held > 0 then
      insert into public.point_ledger (user_id, group_id, challenge_id, delta, reason, ref_id)
      values (r.user_id, v_group_id, p_challenge_id, r.held, 'deposit_release', p_challenge_id);
    end if;

    if v_forfeit > 0 then
      insert into public.point_ledger (user_id, group_id, challenge_id, delta, reason, ref_id)
      values (r.user_id, v_group_id, p_challenge_id, -v_forfeit, 'penalty', p_challenge_id);
    end if;

    update public.challenge_participants
      set deposit_points = 0
    where challenge_id = p_challenge_id and user_id = r.user_id;

    v_pool := v_pool + v_forfeit;
    v_distribution := v_distribution || jsonb_build_object(
      r.user_id::text,
      jsonb_build_object('released', r.held, 'forfeit', v_forfeit, 'net', r.held - v_forfeit)
    );
  end loop;

  -- 확정 분배 스냅샷 + 공동 주머니 적재(개인 재분배 0행)
  update public.settlements
    set pool_points = v_pool, distribution = v_distribution
  where challenge_id = p_challenge_id;
end;
$$;

-- D5. distribute_pool — 정산된 챌린지의 공동 주머니 조회 + 개인 재분배 0행 보증(AC-settle-6).
-- 미달분은 settlements.pool_points 에 그룹 자산으로만 머문다(다음 챌린지 hold 시 공동 스테이크로
-- 소비 — WP3). 개인↔개인 이동 원장 행을 만들지 않음을 명시적으로 확인하는 경로.
create or replace function public.distribute_pool(p_challenge_id uuid)
returns integer
language plpgsql stable security definer
set search_path = public as $$
declare
  v_pool integer;
  v_redistribution_rows integer;
begin
  select s.pool_points into v_pool
  from public.settlements s where s.challenge_id = p_challenge_id;

  if v_pool is null then
    raise exception 'challenge not settled' using errcode = 'P0002';
  end if;

  -- 불변식: 'distribution' reason(개인 재분배) 원장 행은 0건이어야 한다.
  select count(*) into v_redistribution_rows
  from public.point_ledger
  where challenge_id = p_challenge_id and reason = 'distribution';

  if v_redistribution_rows <> 0 then
    raise exception 'pool must stay group-level: % individual redistribution rows found',
      v_redistribution_rows using errcode = 'P0001';
  end if;

  return v_pool;
end;
$$;

-- ============================================================
-- E. 권한 — authenticated 직접 호출(RN/그룹장), service_role(BFF/cron)
-- ============================================================
grant execute on function public.point_balance(uuid, uuid) to authenticated, service_role;
grant execute on function public.hold_deposit(uuid, integer) to authenticated, service_role;
grant execute on function public.deposit_release(uuid, uuid) to authenticated, service_role;
grant execute on function public.settle_challenge(uuid) to authenticated, service_role;
grant execute on function public.distribute_pool(uuid) to authenticated, service_role;
-- grant_bundle_points 는 BFF 전용 — service_role 에만(함수 내부에서도 재검증).
grant execute on function public.grant_bundle_points(uuid, uuid, integer, uuid) to service_role;

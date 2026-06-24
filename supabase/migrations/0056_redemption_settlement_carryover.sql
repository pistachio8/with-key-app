-- supabase/migrations/0056_redemption_settlement_carryover.sql
-- spec: docs/superpowers/specs/2026-06-23-feed-type-penalty-redesign-design.md §C5 (Rollout ④) / EVAL-0045.
-- ADR-0039(penalty-redemption-settlement: deferred penalty·2X carry-over·불변 스냅샷 보존) · ADR-0032(verification data model).
--
-- 본 migration 이 하는 일 (EVAL-0044 가 남긴 deferred 분기 — 적재·수금 활성화):
--   A. point_ledger.reason CHECK 확장(+'penalty_debt_carryover'). native enum 아니라 CHECK(0042:48-56)이라 DROP/ADD.
--   B. penalty_debts UNIQUE(user_id, origin_challenge_id) — finalize 멱등(챌린지당 사용자 1 debt).
--   C. point_ledger 부분 UNIQUE(ref_id) where reason='penalty_debt_carryover' — carry-over 1회 수금 멱등.
--   D. finalize_penalty_proof RPC(service_role) — 창2 만료(종료+96h) 확정. accepted→면제(원장 무변화),
--      rejected/expired(미제출)→penalty_debts(amount=2X, status='open') 적재. X=_settlement_confirmed_penalties.
--   E. settle_challenge create-or-replace — 같은 group_id open debt 를 그 정산 pool_points 계산에 포함하고
--      penalty_debt_carryover(−2X) 원장 1행 append 후 debt 'settled'. **사후 settlements UPDATE 없음**.
--
-- 왜 carry-over 가 settle_challenge 에 내장되나 (ADR-0039 §Decision): settlements_guard_writes(0043:51·0044:46)가
--   비-INSERT 를 무조건 차단해 정산 후 pool_points 를 UPDATE 로 얹는 경로가 막힌다. open debt 는 수금 시점에
--   이미 존재하므로, settle_challenge 의 단일 INSERT pool 계산에 함께 넣으면 사후 수정 없이 귀속된다. 별도
--   post-settlement RPC 로 분리하면 pool 합산이 불가능(UPDATE 차단)하다. 0044/0051 은 편집하지 않고 forward
--   create or replace(0051 선례). distribution per-user shape({released,forfeit,net})는 보존 — carry-over 는
--   pool_points·원장에만 반영(감사추적 = penalty_debt_carryover 원장행 + penalty_debts.settled).
--
-- 번호: append-only(재정렬 금지). 0055 다음 가용 0056. forward-only(down 없음, POC).
--   production apply 보류는 0044·0050·0051·0055 와 동일(G2 게이트). 기존 정산 동작은 open debt 가 없으면 무변(carry-over 0).

-- ============================================================
-- A. point_ledger.reason CHECK 확장 (+ penalty_debt_carryover)
-- ============================================================
-- 0042 의 inline column CHECK 는 자동명 point_ledger_reason_check. DROP IF EXISTS 후 동일명으로 재선언.
-- 기존 reason 값은 전부 보존하고 한 줄만 추가(면제는 원장 행 자체가 없으므로 delta 0 메타 reason 불필요).
alter table public.point_ledger
  drop constraint if exists point_ledger_reason_check;

alter table public.point_ledger
  add constraint point_ledger_reason_check
  check (reason in (
    'bundle_grant',
    'deposit_hold',
    'deposit_release',
    'penalty',
    'distribution',
    'refund',
    'penalty_debt_carryover'
  ));

-- ============================================================
-- B. penalty_debts 멱등 제약 — finalize 1회 적재 (챌린지당 사용자 1 debt)
-- ============================================================
-- 한 사용자의 한 원천 챌린지 redemption 결과는 단 하나(accepted=무, rejected/expired=2X debt 1건)다.
-- finalize 가 cron/lazy 로 여러 번 호출돼도 on conflict do nothing 으로 중복 적재를 막는다.
alter table public.penalty_debts
  add constraint penalty_debts_user_origin_unique unique (user_id, origin_challenge_id);

-- ============================================================
-- C. carry-over 수금 멱등 — debt 당 차감 원장 1행
-- ============================================================
-- ref_id=penalty_debts.id 가 carry-over 원장행의 멱등 키. 부분 UNIQUE 라 다른 reason(ref_id=challenge_id 공유)은
-- 제약 밖. settlements INSERT-once 게이트가 1차 멱등이고 이 인덱스는 cross-challenge 이중수금 backstop.
create unique index if not exists uq_point_ledger_carryover_ref
  on public.point_ledger(ref_id)
  where reason = 'penalty_debt_carryover';

-- ============================================================
-- D. finalize_penalty_proof — 창2 만료 확정 (service_role 전용)
-- ============================================================
-- 종료+96h 이후 cron/lazy 호출. penalty_mission 챌린지의 미달자(confirmed_penalty>0)별로:
--   pending → accepted flip(과반 미반려 = 관용 통과, spec §C4). accepted → 면제(원장·debt 없음).
--   rejected(과반 반려) / 미제출(expired) → penalty_debts(amount=2X, status='open') 적재.
-- X = _settlement_confirmed_penalties(=확정 미달분, spec §C5 타임라인). 2X = ADR-0039 carry-over.
-- 무상/음수성 write(debt 적재)라 service_role 전용(grant_bundle_points 패턴, 0044:205).
create or replace function public.finalize_penalty_proof(p_challenge_id uuid)
returns table (user_id uuid, outcome text, debt_amount integer)
language plpgsql security definer
set search_path = public as $$
#variable_conflict use_column
declare
  v_group_id        uuid;
  v_penalty_mission text;
  v_end             timestamptz;
  r record;
begin
  if coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') <> 'service_role' then
    raise exception 'finalize_penalty_proof is service_role only' using errcode = '42501';
  end if;

  select c.group_id, c.penalty_mission, coalesce(c.closed_at, c.end_at)
    into v_group_id, v_penalty_mission, v_end
    from public.challenges c
    where c.id = p_challenge_id;
  if v_group_id is null then
    raise exception 'challenge not found' using errcode = 'P0002';
  end if;

  -- 벌칙 챌린지만 redemption 대상(penalty_mission 없으면 기존 벌금 즉시차감 경로).
  if nullif(btrim(coalesce(v_penalty_mission, '')), '') is null then
    raise exception 'not a penalty challenge' using errcode = '42501';
  end if;

  -- 창2(종료+48~96h) 만료 후에만 확정. 종료 미상(NULL)이면 만료 불가로 간주(graceful).
  if v_end is null or now() < v_end + interval '96 hours' then
    raise exception 'redemption window not yet expired' using errcode = '42501';
  end if;

  -- pending → accepted(과반 미반려는 관용 통과). rejected 는 toggle 가 이미 확정해 보존.
  update public.penalty_proofs
    set status = 'accepted'
    where challenge_id = p_challenge_id and status = 'pending';

  -- 미달자(확정 X>0)별 결과 확정 + debt 적재. proof 없음 = 미제출 = expired.
  for r in
    select cp.user_id as uid, cp.confirmed_penalty as x
      from public._settlement_confirmed_penalties(p_challenge_id) cp
      where cp.confirmed_penalty > 0
  loop
    declare
      v_status text;
    begin
      select pp.status into v_status
        from public.penalty_proofs pp
        where pp.challenge_id = p_challenge_id and pp.user_id = r.uid;

      if v_status = 'accepted' then
        -- 면제: 추가 원장·debt 없음(차감이 애초에 없었다).
        user_id := r.uid; outcome := 'accepted'; debt_amount := 0;
        return next;
      else
        -- rejected(과반 반려) 또는 미제출(expired) → 2X 이월 채무 적재(멱등).
        insert into public.penalty_debts (user_id, origin_challenge_id, amount, status)
        values (r.uid, p_challenge_id, 2 * r.x, 'open')
        on conflict (user_id, origin_challenge_id) do nothing;

        user_id := r.uid;
        outcome := case when v_status = 'rejected' then 'rejected' else 'expired' end;
        debt_amount := 2 * r.x;
        return next;
      end if;
    end;
  end loop;
end;
$$;

revoke all on function public.finalize_penalty_proof(uuid) from public, anon, authenticated;
grant execute on function public.finalize_penalty_proof(uuid) to service_role;

-- ============================================================
-- E. settle_challenge — carry-over 수금 내장 (INSERT-once 보존)
-- ============================================================
-- 0051 의 단일-INSERT 정산을 그대로 두고, 같은 group_id 의 open penalty_debts 를 (1) pool 선계산에 합산하고
-- (2) 게이트 통과 후 원장(penalty_debt_carryover, −amount)으로 1회 차감하며 debt 를 settled 로 닫는다.
-- open debt 가 없으면(대다수 챌린지) 거동은 0051 과 동일 — 기존 정산 회귀 없음.
create or replace function public.settle_challenge(p_challenge_id uuid)
returns void
language plpgsql security definer
set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '');
  v_group_id uuid;
  v_penalty_mission text;
  v_deferred boolean;
  v_settled_by text;
  v_inserted integer := 0;
  v_pool integer := 0;
  v_distribution jsonb := '{}'::jsonb;
  r record;
  v_forfeit integer;
  v_debt_id uuid;
  v_debt_amount integer;
begin
  select c.group_id, c.penalty_mission
    into v_group_id, v_penalty_mission
  from public.challenges c where c.id = p_challenge_id;
  if v_group_id is null then
    raise exception 'challenge not found' using errcode = 'P0002';
  end if;

  -- 벌칙 챌린지: penalty 를 이 정산에서 차감하지 않고 redemption 창에서 forward 처리(deferred, ADR-0039).
  v_deferred := nullif(btrim(coalesce(v_penalty_mission, '')), '') is not null;

  if v_role = 'service_role' then
    v_settled_by := 'auto';
  elsif exists (select 1 from public.groups g where g.id = v_group_id and g.owner_id = v_uid) then
    v_settled_by := 'owner';
  else
    raise exception 'only group owner or system can settle' using errcode = '42501';
  end if;

  -- 1) pool/distribution 최종값 선계산 (사후 UPDATE 제거 — INSERT-once 의 핵심).
  --    forfeit(이 챌린지 미달분) + carry-over(같은 그룹 이월 채무 2X)를 함께 pool 에 적재.
  for r in
    select
      cp.user_id,
      coalesce(cp.deposit_points, 0) as held,
      coalesce(cpen.confirmed_penalty, 0) as penalty,
      coalesce(d.carryover, 0) as carryover
    from public.challenge_participants cp
    left join public._settlement_confirmed_penalties(p_challenge_id) cpen
      on cpen.user_id = cp.user_id
    left join lateral (
      select sum(pd.amount)::int as carryover
        from public.penalty_debts pd
        join public.challenges oc on oc.id = pd.origin_challenge_id
        where pd.user_id = cp.user_id and pd.status = 'open' and oc.group_id = v_group_id
    ) d on true
    where cp.challenge_id = p_challenge_id and cp.signed_at is not null
  loop
    v_forfeit := case when v_deferred then 0 else least(r.held, greatest(r.penalty, 0)) end;
    v_pool := v_pool + v_forfeit + r.carryover;
    v_distribution := v_distribution || jsonb_build_object(
      r.user_id::text,
      jsonb_build_object('released', r.held, 'forfeit', v_forfeit, 'net', r.held - v_forfeit)
    );
  end loop;

  -- 벌칙 챌린지 스냅샷 메타: 최종 미달분이 아직 확정 전임을 표시(spec §C5, computeSettlement.redemptionPending 미러).
  if v_deferred then
    v_distribution := v_distribution || jsonb_build_object('redemption_pending', true);
  end if;

  -- 2) 멱등 게이트 = 단일 INSERT(최종값). 이미 정산됐으면 0행 → no-op(클릭+cron 동시에도 정산 1회).
  insert into public.settlements (challenge_id, settled_by, pool_points, distribution)
  values (p_challenge_id, v_settled_by, v_pool, v_distribution)
  on conflict (challenge_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return; -- 이미 정산됨 → 추가 원장 0행 (AC-settle-trigger-3). carry-over 도 재수금 안 함.
  end if;

  -- 3) 정산 확정(게이트 통과) 후에만 원장 append + 보증금 소진 + carry-over 차감. release-full + penalty 규약.
  --    deferred 챌린지는 v_forfeit=0 이라 penalty 행이 생기지 않는다(deposit_release 만).
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
    v_forfeit := case when v_deferred then 0 else least(r.held, greatest(r.penalty, 0)) end;

    if r.held > 0 then
      insert into public.point_ledger (user_id, group_id, challenge_id, delta, reason, ref_id)
      values (r.user_id, v_group_id, p_challenge_id, r.held, 'deposit_release', p_challenge_id);
    end if;

    if v_forfeit > 0 then
      insert into public.point_ledger (user_id, group_id, challenge_id, delta, reason, ref_id)
      values (r.user_id, v_group_id, p_challenge_id, -v_forfeit, 'penalty', p_challenge_id);
    end if;

    -- carry-over 수금: 같은 그룹 open debt 를 debt 당 1행(−amount)으로 차감 후 settled.
    -- ref_id=debt.id 부분 UNIQUE(C) 로 이중수금 backstop. pool 합산(1)과 동일 debt 집합(같은 트랜잭션).
    for v_debt_id, v_debt_amount in
      select pd.id, pd.amount
        from public.penalty_debts pd
        join public.challenges oc on oc.id = pd.origin_challenge_id
        where pd.user_id = r.user_id and pd.status = 'open' and oc.group_id = v_group_id
    loop
      insert into public.point_ledger (user_id, group_id, challenge_id, delta, reason, ref_id)
      values (r.user_id, v_group_id, p_challenge_id, -v_debt_amount, 'penalty_debt_carryover', v_debt_id)
      on conflict (ref_id) where reason = 'penalty_debt_carryover' do nothing;

      update public.penalty_debts
        set status = 'settled', settled_at = now()
      where id = v_debt_id and status = 'open';
    end loop;

    update public.challenge_participants
      set deposit_points = 0
    where challenge_id = p_challenge_id and user_id = r.user_id;
  end loop;
end;
$$;

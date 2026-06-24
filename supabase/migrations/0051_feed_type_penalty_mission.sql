-- supabase/migrations/0051_feed_type_penalty_mission.sql
-- spec: docs/superpowers/specs/2026-06-23-feed-type-penalty-redesign-design.md §C1·§C5
-- ADR-0039(penalty-redemption-settlement) · ADR-0040(feed-type-video-capture) / EVAL-0042 (Rollout ①).
--
-- 본 migration 이 하는 일:
--   A. challenges.feed_type / penalty_mission 컬럼 추가 (안전 기본값 → 기존 행 자동 backfill).
--   B. create_challenge RPC: feed_type·penalty_mission default 파라미터 추가. 단일 시그니처 유지를 위해
--      기존 6-인자 오버로드를 drop 후 8-인자로 재생성(0020 오버로드 drop 선례). 호출부(_actions.ts)는
--      named 6-param 호출이라 default 로 투명 호환.
--   C. settle_challenge RPC 재설계: placeholder-INSERT→UPDATE 패턴 제거 → pool/distribution 선계산 후
--      단일 INSERT. settlements_guard_writes(0043:38·0044:46)가 비-INSERT 를 무조건 차단하므로 기존
--      UPDATE 경로가 막히던 Blocker(ADR-0039 §Decision)를 해소한다. 벌칙 챌린지(penalty_mission 있음)는
--      penalty 를 deferred 처리(이 정산 미차감 + redemption_pending 메타) — packages/domain/settlement.ts
--      computeSettlement 와 1:1 미러.
--
-- 번호: append-only(재정렬 금지). 0050 다음 가용 번호 0051. 0044·0050 은 편집하지 않는다(단방향, forward-only).
-- production apply 보류는 0044 와 동일(G2 게이트). 결정론 불변식(이중정산 no-op·잔액=Σdelta·INSERT-once)은 게이트 무관.

-- ============================================================
-- A. challenges 컬럼 추가 (NOT NULL DEFAULT 'image' → 기존 행 자동 backfill)
-- ============================================================
alter table public.challenges
  add column if not exists feed_type text not null default 'image'
    check (feed_type in ('image', 'video'));

alter table public.challenges
  add column if not exists penalty_mission text;

comment on column public.challenges.feed_type is
  '인증 medium·결과물 타입(image=사진/기존 recap, video=실시간 3초 캡처/스토리). 기본 image 로 기존 동작 보존.';
comment on column public.challenges.penalty_mission is
  '그룹장이 정한 벌칙(행동 미션) 자유 입력. NULL 이면 기존 벌금 전용. 있으면 redemption(deferred penalty) 경로 활성.';

-- ============================================================
-- B. create_challenge — feed_type·penalty_mission default 파라미터 추가
-- ============================================================
-- 단일 시그니처 유지: 기존 6-인자 함수를 drop 후 8-인자로 재생성(오버로드 신설 회피).
-- drop 으로 0021 의 grant 도 함께 사라지므로 8-인자 시그니처에 revoke/grant 재선언.
drop function if exists public.create_challenge(uuid, text, text, int, int, int);

create or replace function public.create_challenge(
  p_group_id uuid,
  p_title text,
  p_type text,
  p_goal_count int,
  p_duration_days int,
  p_penalty_amount int,
  p_feed_type text default 'image',
  p_penalty_mission text default null
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

  if coalesce(p_feed_type, 'image') not in ('image', 'video') then
    raise exception 'invalid feed_type' using errcode = '22023';
  end if;

  select owner_id into v_owner_id from public.groups where id = p_group_id;
  if not found then
    raise exception 'group not found' using errcode = 'P0002';
  end if;
  if v_owner_id <> v_uid then
    raise exception 'not group owner' using errcode = '42501';
  end if;

  insert into public.challenges (
    group_id, title, type, goal_count, duration_days, penalty_amount, feed_type, penalty_mission
  )
  values (
    p_group_id, p_title, p_type, p_goal_count, p_duration_days, p_penalty_amount,
    coalesce(p_feed_type, 'image'),
    nullif(btrim(p_penalty_mission), '')
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

revoke all on function
  public.create_challenge(uuid, text, text, int, int, int, text, text)
  from public, anon;
grant execute on function
  public.create_challenge(uuid, text, text, int, int, int, text, text)
  to authenticated, service_role;

-- ============================================================
-- C. settle_challenge — 단일 INSERT 재설계 (Blocker 해소) + deferred penalty
-- ============================================================
-- 기존(0044)은 placeholder INSERT(pool=0) 후 UPDATE 로 최종값을 덮었으나, settlements_guard_writes 가
-- 비-INSERT 를 무조건 차단(0043:38)해 그 UPDATE 가 막혔다. 여기선 pool/distribution 을 먼저 계산해
-- 최종값으로 단일 INSERT 하고, 멱등 게이트(settlements PK + on conflict do nothing) 통과 시에만 원장·참가자를
-- 갱신한다. 사후 UPDATE 가 사라져 진짜 불변(1 INSERT·영구 무수정)이 보장된다.
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

  -- 1) pool/distribution 최종값 선계산 (사후 UPDATE 제거 — INSERT-once 의 핵심)
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
    v_pool := v_pool + v_forfeit;
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
    return; -- 이미 정산됨 → 추가 원장 0행 (AC-settle-trigger-3)
  end if;

  -- 3) 정산 확정(게이트 통과) 후에만 원장 append + 보증금 소진. release-full + penalty 규약.
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

    update public.challenge_participants
      set deposit_points = 0
    where challenge_id = p_challenge_id and user_id = r.user_id;
  end loop;
end;
$$;

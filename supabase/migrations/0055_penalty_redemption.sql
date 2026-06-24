-- supabase/migrations/0055_penalty_redemption.sql
-- spec: docs/superpowers/specs/2026-06-23-feed-type-penalty-redesign-design.md §C3·§C4 (Rollout ③) / EVAL-0044.
-- ADR-0039(penalty-redemption-settlement: deferred penalty·2X carry-over·불변 스냅샷 보존) · ADR-0032(verification data model).
--
-- 본 migration 이 하는 일 (EVAL-0044 범위 — carry-over 수금·point_ledger.reason 확장·정산 연동·만료 cron 은
--   EVAL-0045/후속 out of scope):
--   A. penalty_proofs — 미달자 벌칙 수행 증명(영상) 제출. 챌린지당 1인 1행(UNIQUE).
--   B. penalty_proof_rejections — 증명 동료 판단(익명 반려). peer_rejections(0048) 미러.
--   C. penalty_debts — 면제 실패(rejected/expired) 시 2X 이월 채무. 테이블·RLS 만(적재·수금은 EVAL-0045).
--   D. RLS — 저장 ≠ 노출, write=RPC만(0048 §B 미러).
--   E. submit_penalty_proof RPC — 창2[종료+48h~96h] 제출(write=RPC만, action-videos 경로 검증).
--   F. toggle_penalty_proof_rejection RPC — 동료 판단 토글·과반(toggle_peer_rejection[0048] 동일식 미러).
--
-- 익명성 메커니즘은 0048 과 동일: voter_id 저장(본인 반려 거부·토글·과반 계산용)하되 어떤 read 도 반환 안 함
--   = (a) RLS SELECT 본인 행 한정 + (b) 카운트 read 의 select 컬럼에서 voter_id 배제(후속 read 모듈에서).
-- 번호: append-only(재정렬 금지). spec 예약번호 0053 은 0052·0053 test-cleanup 선머지로 소진 → next available 0055.
--   forward-only(down 없음, POC). production apply 게이트는 0044·0050·0051·0054 와 동일(G2). 신규 테이블·RPC 는 기존 동작 무변.

-- ============================================================
-- A. penalty_proofs — 벌칙 수행 증명 제출 (1인 1제출)
-- ============================================================
-- status 라이프사이클: pending(라이브 판단중·제출 직후) ↔ rejected(과반 반려, 토글로 복원 가능).
--   accepted/expired 는 창2 만료(종료+96h) 확정 단계에서만 set(cron, EVAL-0045+) — 토글 경로 밖.
-- UNIQUE(challenge_id, user_id): 그룹장 단일 미션을 미달자 공통 수행 → 챌린지당 1인 1제출(재제출=update).
create table if not exists public.penalty_proofs (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id      uuid not null references public.users(id),
  media_path   text not null check (char_length(media_path) between 10 and 512),
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'rejected', 'expired')),
  submitted_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (challenge_id, user_id)
);

comment on table public.penalty_proofs is
  '벌칙(만회 찬스) 수행 증명 영상 제출(spec §C3). challenge당 미달자 1인 1행(재제출=update). status pending↔rejected 토글, accepted/expired 는 창2 만료 확정(EVAL-0045+).';
comment on column public.penalty_proofs.media_path is
  'action-videos 버킷 경로({userId}/{challengeId}/...). 영상 벤더 무관 medium-agnostic(spec §C8).';

-- ============================================================
-- B. penalty_proof_rejections — 증명 동료 판단(익명 반려). peer_rejections(0048) 미러
-- ============================================================
-- UNIQUE(proof_id, voter_id) 가 1인 1표·토글 멱등·중복 방지를 스키마 레벨에서 보장.
create table if not exists public.penalty_proof_rejections (
  id         uuid primary key default gen_random_uuid(),
  proof_id   uuid not null references public.penalty_proofs(id) on delete cascade,
  voter_id   uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  unique (proof_id, voter_id)
);

create index if not exists idx_penalty_proof_rejections_proof
  on public.penalty_proof_rejections(proof_id);

comment on table public.penalty_proof_rejections is
  '벌칙 증명 익명 동료 반려(peer_rejections[0048] 미러). voter_id 저장하되 read 비노출(카운트만). 과반 시 penalty_proofs.status=rejected.';
comment on column public.penalty_proof_rejections.voter_id is
  '반려자. 저장 이유는 본인 반려 거부·토글·과반 계산뿐 — 어떤 read 도 반환 금지(익명성). RLS SELECT 본인 행 한정.';

-- ============================================================
-- C. penalty_debts — 면제 실패 2X 이월 채무 (테이블·RLS 만; 적재·수금은 EVAL-0045)
-- ============================================================
-- rejected/expired 확정(종료+96h, cron/EVAL-0045) 시 amount=2X 로 적재. 수금은 같은 group_id 다음 정산에서
-- point_ledger penalty_debt_carryover(−2X)로 1회 차감 후 status=settled(EVAL-0045). group 스코핑은
-- origin_challenge_id → challenges.group_id 로 도출(비정규화 안 함, spec §풀 모델).
create table if not exists public.penalty_debts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id),
  origin_challenge_id uuid not null references public.challenges(id) on delete cascade,
  amount              integer not null check (amount > 0),
  status              text not null default 'open' check (status in ('open', 'settled')),
  created_at          timestamptz not null default now(),
  settled_at          timestamptz
);

-- 수금 후보 조회용(EVAL-0045): 사용자별 open 채무. 부분 인덱스라 settled 행은 제외.
create index if not exists idx_penalty_debts_user_open
  on public.penalty_debts(user_id) where status = 'open';

comment on table public.penalty_debts is
  '벌칙 면제 실패(rejected/expired) 시 2X 이월 채무(spec §C5). 적재·수금(penalty_debt_carryover)은 EVAL-0045. forward-only redemption — settlements 스냅샷 사후수정 금지.';

-- ============================================================
-- D. RLS — 저장 ≠ 노출, write=RPC만 (spec §C3 / 0048 §B 미러)
-- ============================================================
-- 세 테이블 모두 INSERT/UPDATE/DELETE 정책 없음 → 클라(anon/authenticated) write 전면 deny.
-- penalty_proofs write 는 submit RPC(E), penalty_proof_rejections write 는 toggle RPC(F),
-- penalty_debts write 는 service_role(EVAL-0045 cron) — 전부 RLS 우회 definer/service 경로.
alter table public.penalty_proofs enable row level security;
alter table public.penalty_proof_rejections enable row level security;
alter table public.penalty_debts enable row level security;

-- penalty_proofs SELECT: 같은 그룹 멤버(증명 열람·판단용). is_group_member(0054 재사용).
create policy penalty_proofs_select_group_member on public.penalty_proofs
  for select using (
    exists (
      select 1 from public.challenges c
      where c.id = penalty_proofs.challenge_id
        and public.is_group_member(c.group_id)
    )
  );

-- penalty_proof_rejections SELECT: 본인 행만(익명성 — 타인 voter_id 역추적 불가).
create policy penalty_proof_rejections_select_self on public.penalty_proof_rejections
  for select using (voter_id = auth.uid());

-- penalty_debts SELECT: 본인 또는 그룹 멤버(point_ledger 패턴, spec §C3).
create policy penalty_debts_select_self_or_group on public.penalty_debts
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.challenges c
      where c.id = penalty_debts.origin_challenge_id
        and public.is_group_member(c.group_id)
    )
  );

-- ============================================================
-- E. submit_penalty_proof — 창2 제출 (write=RPC만, SECURITY DEFINER)
-- ============================================================
-- write=RPC만(D) 이라 제출도 RPC 한 경로로 닫는다. media_path 가 제출자·챌린지와 일치하는지 재검증해
-- 클라가 임의 경로를 박지 못하게 한다(update_action_log_video_path[0054] 경로 검증 패턴 미러).
-- 제출 자격의 X>0(확정 미달분) 판정은 weekly 도메인 계산이라 SQL 에서 재구현하지 않고 read/UI 계층에 둔다 —
-- RPC 는 서약 참가자·벌칙 챌린지·창2 시간창만 강제(악의적 비참가자/창 밖 제출 차단).
-- search_path 고정 — search-path 하이재킹 방어(0048·0054 DEFINER RPC 동일).
create or replace function public.submit_penalty_proof(
  p_challenge_id uuid,
  p_media_path text
)
returns table (proof_id uuid, status text)
language plpgsql security definer
set search_path = public as $$
#variable_conflict use_column
declare
  v_uid             uuid := auth.uid();
  v_group_id        uuid;
  v_penalty_mission text;
  v_end             timestamptz;
  v_proof_id        uuid;
  v_status          text;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  -- action-videos 경로 검증: {userId}/{challengeId}/... (제출자·챌린지 일치).
  if char_length(coalesce(p_media_path, '')) not between 10 and 512 then
    raise exception 'invalid media_path length' using errcode = '22023';
  end if;
  if split_part(p_media_path, '/', 1) <> v_uid::text
     or split_part(p_media_path, '/', 2) <> p_challenge_id::text then
    raise exception 'media_path does not match submitter/challenge' using errcode = '42501';
  end if;

  select c.group_id, c.penalty_mission, coalesce(c.closed_at, c.end_at)
    into v_group_id, v_penalty_mission, v_end
    from public.challenges c
    where c.id = p_challenge_id;
  if v_group_id is null then
    raise exception 'challenge not found' using errcode = 'P0002';
  end if;

  -- 벌칙 챌린지만(penalty_mission 있어야 redemption 경로 — 미입력이면 기존 벌금 동작, feature flag 겸).
  if nullif(btrim(coalesce(v_penalty_mission, '')), '') is null then
    raise exception 'not a penalty challenge' using errcode = '42501';
  end if;

  -- 서약 참가자만 제출 자격.
  if not exists (
    select 1 from public.challenge_participants cp
    where cp.challenge_id = p_challenge_id
      and cp.user_id = v_uid
      and cp.signed_at is not null
  ) then
    raise exception 'only signed participants may submit penalty proof' using errcode = '42501';
  end if;

  -- 창2: [종료+48h, 종료+96h]. 창1(0~48h)에 미달분 X 동결 후에만 제출 열림(spec §C3 타임라인).
  if v_end is null then
    raise exception 'challenge not ended' using errcode = '42501';
  end if;
  if now() < v_end + interval '48 hours' or now() > v_end + interval '96 hours' then
    raise exception 'penalty proof window closed' using errcode = '42501';
  end if;

  -- upsert: 1인 1제출(재제출은 media_path·submitted_at 갱신; status·기존 반려는 보존).
  insert into public.penalty_proofs (challenge_id, user_id, media_path, status)
  values (p_challenge_id, v_uid, p_media_path, 'pending')
  on conflict (challenge_id, user_id)
    do update set media_path = excluded.media_path, submitted_at = now()
  returning id, status into v_proof_id, v_status;

  proof_id := v_proof_id;
  status := v_status;
  return next;
end;
$$;

revoke all on function public.submit_penalty_proof(uuid, text) from public, anon;
grant execute on function public.submit_penalty_proof(uuid, text) to authenticated, service_role;

-- ============================================================
-- F. toggle_penalty_proof_rejection — 동료 판단 토글·과반 (toggle_peer_rejection[0048] 동일식 미러)
-- ============================================================
-- 0048 과 동일: advisory xact lock 직렬화 + 본인 증명 반려 거부 + 서약 참가자 자격 + 시간창 + 과반 재계산.
-- 차이는 대상이 action_logs.auto_verify_status(passed↔peer_rejected) 가 아니라
-- penalty_proofs.status(pending↔rejected) 라는 점뿐. 과반식 reject_count > (N-1)/2 는 그대로.
create or replace function public.toggle_penalty_proof_rejection(p_proof_id uuid)
returns table (reject_count integer, viewer_rejected boolean, status text)
language plpgsql security definer
set search_path = public as $$
#variable_conflict use_column
declare
  v_uid          uuid := auth.uid();
  v_performer    uuid;
  v_challenge_id uuid;
  v_end          timestamptz;
  v_n            integer;
  v_count        integer;
  v_now_rejected boolean;
  v_status       text;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  -- 동시 토글 직렬화(0048 동일): 같은 proof 의 토글·과반 전이를 1건씩(READ COMMITTED 카운트 누락 방지).
  -- xact lock 이라 트랜잭션 종료 시 자동 해제. 다른 proof 토글끼리는 블록되지 않는다.
  perform pg_advisory_xact_lock(hashtextextended(p_proof_id::text, 0));

  select pp.user_id, pp.challenge_id
    into v_performer, v_challenge_id
    from public.penalty_proofs pp
    where pp.id = p_proof_id;
  if v_challenge_id is null then
    raise exception 'penalty proof not found' using errcode = 'P0002';
  end if;

  -- 수행자(증명 제출자) 본인은 자기 증명 반려 불가(0048 self-reject 금지 미러).
  if v_performer = v_uid then
    raise exception 'cannot reject own penalty proof' using errcode = '42501';
  end if;

  -- 판단 자격: 해당 챌린지 서약 참가자만(0048 §3a 미러 — 전자단 = 서약 완료 참가자).
  if not exists (
    select 1 from public.challenge_participants cp
    where cp.challenge_id = v_challenge_id
      and cp.user_id = v_uid
      and cp.signed_at is not null
  ) then
    raise exception 'only signed participants may judge penalty proof' using errcode = '42501';
  end if;

  -- 창2: [종료+48h, 종료+96h] 안에서만 토글(spec §C4 만료 = 종료+96h). 종료 미상(NULL)이면 진행 중 간주(graceful).
  select coalesce(c.closed_at, c.end_at) into v_end
    from public.challenges c where c.id = v_challenge_id;
  if v_end is not null
     and (now() < v_end + interval '48 hours' or now() > v_end + interval '96 hours') then
    raise exception 'penalty judgment window closed' using errcode = '42501';
  end if;

  -- 토글: 행 있으면 취소(delete), 없으면 반려(insert). UNIQUE 충돌은 멱등 처리.
  delete from public.penalty_proof_rejections
    where proof_id = p_proof_id and voter_id = v_uid;
  if found then
    v_now_rejected := false;
  else
    insert into public.penalty_proof_rejections (proof_id, voter_id)
    values (p_proof_id, v_uid)
    on conflict (proof_id, voter_id) do nothing;
    v_now_rejected := true;
  end if;

  -- 과반 재계산(0048 동일식). N = 서약 참가자(토글 시점 재계산 — 중도 합류 반영), 수행자 제외 (N-1).
  select count(*)::int into v_n
    from public.challenge_participants cp
    where cp.challenge_id = v_challenge_id and cp.signed_at is not null;

  select count(*)::int into v_count
    from public.penalty_proof_rejections pr
    where pr.proof_id = p_proof_id;

  -- 전이: pending → rejected(과반), rejected → pending(미달 복원). accepted/expired 는 만료 확정만(EVAL-0045+).
  -- WHERE 의 status 조건이 그 외 status(accepted/expired)를 자동 보호.
  if v_count > (v_n - 1)::numeric / 2 then
    update public.penalty_proofs
      set status = 'rejected'
      where id = p_proof_id and status = 'pending';
  else
    update public.penalty_proofs
      set status = 'pending'
      where id = p_proof_id and status = 'rejected';
  end if;

  select pp.status into v_status
    from public.penalty_proofs pp where pp.id = p_proof_id;

  reject_count := v_count;
  viewer_rejected := v_now_rejected;
  status := v_status;
  return next;
end;
$$;

-- 권한 — authenticated 직접 호출(RN/PWA), service_role(BFF). public·anon 금지(0048 §D 동일).
revoke execute on function public.toggle_penalty_proof_rejection(uuid) from public, anon;
grant execute on function public.toggle_penalty_proof_rejection(uuid) to authenticated, service_role;

-- supabase/migrations/0048_peer_rejections.sql
-- ADR-0038 (accepted 2026-06-14, PO 승인) / EVAL-0025 (WP5) —
--   🟨 익명 피어 반려: 그룹장 단독 판정을 그룹의 익명 다수결로 대체한다.
--   θ 자동검증이 못 잡는 맥락적 사기(매번 같은 장소·무관한 사진 등)를 멤버가 익명으로 거른다.
--
-- 설계 SoT 는 ADR-0038. 핵심 경계 셋:
--   ① 저장 ≠ 노출 — voter_id 는 저장하되(본인 반려 거부·토글·과반 계산용) 어떤 read 도 반환하지 않는다.
--      익명성의 실질 메커니즘은 (a) RLS SELECT 본인 행 한정 + (b) 카운트 read 의 select 컬럼에서 voter_id 배제.
--   ② kudos union 무변경 — 별도 테이블(반려는 표현이 아니라 판정 입력). PRD §9.1 analytics 1:1 보존.
--   ③ 판정·토글·48h·과반·본인 반려 거부를 SECURITY DEFINER RPC 한 경로로 닫는다 — RN 직접 RPC/BFF 에서도
--      클라 토큰이 RLS 만으로 익명성·정합을 깨지 못한다.
--
-- 번호: append-only(재정렬 금지). 0047_feedback 다음 가용 번호 0048.
-- forward-only(down 없음, POC 정책). production apply 는 후속 — 스키마·로컬 검증은 게이트 무관(θ·G2 무관, ADR-0038 §게이트).

-- ============================================================
-- A. peer_rejections — 익명 반려 저장 (kudos 와 분리, 동형이되 emoji 없음)
-- ============================================================
-- kudos 테이블(0001)과 동형: action_log_id · voter_id · created_at. 단 emoji 없음(반려는 단일 의미).
-- UNIQUE(action_log_id, voter_id) 가 1인 1표·토글 멱등·중복 방지를 스키마 레벨에서 보장.
create table if not exists public.peer_rejections (
  id            uuid primary key default gen_random_uuid(),
  action_log_id uuid not null references public.action_logs(id) on delete cascade,
  voter_id      uuid not null references public.users(id),
  created_at    timestamptz not null default now(),
  unique (action_log_id, voter_id)
);

-- 카운트 집계용. voter-scoped 조회(토글·viewer read)는 unique(action_log_id, voter_id) 가 커버.
create index if not exists idx_peer_rejections_action_log
  on public.peer_rejections(action_log_id);

comment on table public.peer_rejections is
  '🟨 익명 피어 반려 reaction(ADR-0038). voter_id 저장하되 read 비노출(카운트만). 과반 시 action_logs.auto_verify_status=peer_rejected.';
comment on column public.peer_rejections.voter_id is
  '반려자. 저장 이유는 본인 반려 거부·토글·과반 계산뿐 — 어떤 read 도 반환 금지(익명성). RLS SELECT 본인 행 한정.';

-- ============================================================
-- B. RLS — 저장 ≠ 노출 (ADR-0038 §2)
-- ============================================================
-- SELECT 는 본인 행만: 멤버가 raw 행을 직접 읽어도 타인의 voter_id 를 못 본다 → 역추적 불가.
-- INSERT/UPDATE/DELETE 정책 없음 → 클라(anon/authenticated) write 전면 deny. write 는 RPC(definer)만.
--   (kudos 는 write 정책이 있어 클라 직접 토글이지만, 반려는 익명·판정 입력이라 RPC 한 경로로 닫는다.)
-- 카운트·viewer read 는 admin client(service_role, RLS 우회)가 select 컬럼 통제로 익명성을 지킨다(ADR-0024 hydrate).
alter table public.peer_rejections enable row level security;

create policy peer_rejections_select_self on public.peer_rejections
  for select using (voter_id = auth.uid());

-- ============================================================
-- C. toggle_peer_rejection — 판정·토글·48h·과반·본인 반려 거부 (SECURITY DEFINER, ADR-0038 §3)
-- ============================================================
-- DEFINER 라 함수 본문은 소유자(postgres)로 돈다 → action_logs.auto_verify_status UPDATE 가
--   0045 가드(prevent_ai_column_update)의 서버 분기(current_user not in (anon,authenticated))를 통과한다.
--   직접 클라 write 는 RLS(위 B, write 정책 없음) + 0045 가드가 이중으로 막는다.
-- set search_path = public 고정 — search-path 하이재킹 방어(0006·0021·0044 DEFINER RPC 와 동일).
--
-- 반환: 토글 후 카운트·viewer 본인 여부·결과 status. Server Action 이 read-your-writes 로 즉시 반영.
create or replace function public.toggle_peer_rejection(p_action_log_id uuid)
returns table (peer_reject_count integer, viewer_rejected boolean, status text)
language plpgsql security definer
set search_path = public as $$
declare
  v_uid          uuid := auth.uid();
  v_author       uuid;
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

  -- 동시 토글 직렬화: 같은 action_log 의 토글·카운트·과반 전이를 한 번에 하나씩만 처리한다.
  -- 직렬화가 없으면 두 voter 의 동시 반려가 서로의 미커밋 행을 못 봐 count 가 각각 1 로 읽혀
  -- 과반(예: N=4 에서 2표) 전이가 누락될 수 있다(READ COMMITTED). 키는 action_log_id 해시라
  -- 다른 인증의 토글끼리는 블록되지 않는다. xact lock 이라 트랜잭션 종료 시 자동 해제.
  perform pg_advisory_xact_lock(hashtextextended(p_action_log_id::text, 0));

  select al.user_id, al.challenge_id
    into v_author, v_challenge_id
    from public.action_logs al
    where al.id = p_action_log_id;
  if v_challenge_id is null then
    raise exception 'action log not found' using errcode = 'P0002';
  end if;

  -- 본인 인증은 반려 불가 (AC-peer-reject-2).
  if v_author = v_uid then
    raise exception 'cannot peer-reject own action log' using errcode = '42501';
  end if;

  -- 투표 자격: 해당 챌린지 서약 참가자만 (ADR-0038 §3a — 전자단 = 서약 완료 참가자).
  -- 서약하지 않은 그룹원은 목표·기간 맥락을 공유하지 않아 평가 자격이 없다.
  if not exists (
    select 1 from public.challenge_participants cp
    where cp.challenge_id = v_challenge_id
      and cp.user_id = v_uid
      and cp.signed_at is not null
  ) then
    raise exception 'only signed participants may peer-reject' using errcode = '42501';
  end if;

  -- 48h 시간창: 종료(closed_at 조기종료 SoT, 폴백 end_at 자연종료) + 48h 이후 토글 무효 (AC-peer-reject-3, ADR-0030 재사용).
  -- 둘 다 NULL(미시작·레거시)이면 비교가 NULL → 진행 중으로 간주해 허용(graceful).
  select coalesce(c.closed_at, c.end_at)
    into v_end
    from public.challenges c
    where c.id = v_challenge_id;
  if v_end is not null and now() > v_end + interval '48 hours' then
    raise exception 'peer rejection window closed' using errcode = '42501';
  end if;

  -- 토글: 행 있으면 취소(delete), 없으면 반려(insert). UNIQUE 충돌은 멱등 처리.
  delete from public.peer_rejections
    where action_log_id = p_action_log_id and voter_id = v_uid;
  if found then
    v_now_rejected := false;
  else
    insert into public.peer_rejections (action_log_id, voter_id)
    values (p_action_log_id, v_uid)
    on conflict (action_log_id, voter_id) do nothing;
    v_now_rejected := true;
  end if;

  -- 과반 재계산 (ADR-0038 §3a). N = 서약 참가자(토글 시점 재계산 — 중도 합류 반영).
  -- 작성자 제외 (N-1) 표본, 과반 = peer_reject_count > (N-1)/2.
  select count(*)::int into v_n
    from public.challenge_participants cp
    where cp.challenge_id = v_challenge_id and cp.signed_at is not null;

  select count(*)::int into v_count
    from public.peer_rejections pr
    where pr.action_log_id = p_action_log_id;

  -- 전이: passed → peer_rejected(과반), peer_rejected → passed(미달 복원). passed ↔ peer_rejected 단일 쌍(ADR-0038 §3c).
  -- failed/pending/manual_review 는 1차 범위 밖 — WHERE 의 status 조건이 그 외 status 를 자동 보호.
  if v_count > (v_n - 1)::numeric / 2 then
    update public.action_logs
      set auto_verify_status = 'peer_rejected'
      where id = p_action_log_id and auto_verify_status = 'passed';
  else
    update public.action_logs
      set auto_verify_status = 'passed'
      where id = p_action_log_id and auto_verify_status = 'peer_rejected';
  end if;

  select al.auto_verify_status into v_status
    from public.action_logs al where al.id = p_action_log_id;

  peer_reject_count := v_count;
  viewer_rejected := v_now_rejected;
  status := v_status;
  return next;
end;
$$;

-- ============================================================
-- D. 권한 — authenticated 직접 호출(RN/PWA), service_role(BFF). public·anon 금지.
-- ============================================================
revoke execute on function public.toggle_peer_rejection(uuid) from public, anon;
grant execute on function public.toggle_peer_rejection(uuid) to authenticated, service_role;

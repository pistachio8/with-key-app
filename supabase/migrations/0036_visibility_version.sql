-- 0036_visibility_version.sql — Phase 2 (SNS cache plan v4).
-- challenges.visibility_version: 멤버십 변경 시 자동 증분되는 단조 counter.
-- 캐시 키 segment 로 사용 (user-${uid}-feed-${cid}-v${visibility_version}).
-- 정책: forward-only (ONBOARDING §4.3). RLS 정책 신규/변경 없음.

-- ============================================================
-- 1. visibility_version 컬럼 추가
-- ============================================================
-- BIGINT: 멤버십 INSERT/DELETE 빈도가 매우 낮아 overflow 위험 사실상 0이지만,
-- counter 의 의미상 단조 증가 + roll-over 안전을 위해 INT 대신 BIGINT.
alter table public.challenges
  add column visibility_version bigint not null default 0;

-- ============================================================
-- 2. bump 함수 — trigger 에서 호출
-- ============================================================
-- security definer: trigger 가 challenges UPDATE 를 수행하는데, 호출 컨텍스트
-- (INSERT/DELETE on challenge_participants) 의 user role 은 challenges UPDATE
-- 권한이 없을 수 있음. RLS 우회는 본 컬럼 한정 단순 increment 이므로 안전.
-- search_path 고정: security definer 함수의 schema hijack 방어 (Supabase advisor).
create or replace function public.bump_challenge_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.challenges
  set visibility_version = visibility_version + 1
  where id = coalesce(new.challenge_id, old.challenge_id);
  -- AFTER trigger 의 return 값은 무시되지만 표준 관례로 null.
  return null;
end;
$$;

-- ============================================================
-- 3. trigger 설치
-- ============================================================
-- challenge_participants 의 INSERT (join) 또는 DELETE (leave/kick) 시 자동 증분.
-- UPDATE 는 visibility 영향이 없으므로 (signed 같은 컬럼 변경만) 의도적으로 제외.
drop trigger if exists trg_bump_challenge_visibility on public.challenge_participants;
create trigger trg_bump_challenge_visibility
  after insert or delete on public.challenge_participants
  for each row
  execute function public.bump_challenge_visibility();

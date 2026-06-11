-- supabase/migrations/0045_action_logs_verify_columns.sql
-- ADR-0032 §4 / EVAL-0020 (WP1) — 사진 자동검증 status·신호의 서버 전용 저장 구조.
--
-- 적재: action_logs 검증 컬럼군 5개(기본 passed = 친구 신뢰).
-- 가드: prevent_ai_column_update(0002) 확장 → 클라(anon/authenticated) 검증 컬럼 위조 UPDATE 를 42501 거부.
-- immutability: 본문(키워드·종류·식별자)은 불변, 예외 2가지만 — ① 검증 status 컬럼군 서버 UPDATE
--               ② 마감 전 사진 교체(photo_path). 사진 교체의 '마감 전·1회' 게이팅·재탐지는 WP4(EVAL-0024).
--
-- 번호: ADR-0032 스케치는 0044 를 가리키나 0042~0044 가 정산 migration 으로 이미 점유됨 →
--       append-only 규약(재정렬 금지)상 다음 가용 번호 0045 사용.
-- 컬럼은 신호·점수·버전 메타만 적재 — 사진/일기 본문은 저장하지 않는다.
-- production apply 는 후속(down 없음). 스키마·로컬 검증은 게이트 무관(ADR-0032 §게이트 경계).

-- ============================================================
-- A. 검증 컬럼군 5개
-- ============================================================
-- enum 은 repo 컨벤션(challenges.status 등)을 따라 text + CHECK — native pg enum 미사용.
-- 기본값 passed: 친구 신뢰 모델(사진은 운동을 증명 못 하므로 false-reject 비용↑, AC-auto-verify-1 전제).
--   NOT NULL + default 'passed' 이므로 기존 행도 backfill 시 'passed' 로 채워진다.
-- peer_rejected: WP5 익명 다수결 반려 결과(주간 카운트 제외). 기존 challenges.status 흐름과 독립 — 충돌 없음.
alter table public.action_logs
  add column if not exists auto_verify_status text not null default 'passed'
    check (auto_verify_status in ('pending','passed','failed','manual_review','peer_rejected')),
  add column if not exists auto_verify_score numeric,
  add column if not exists auto_verify_model_version text,
  add column if not exists photo_phash text,
  add column if not exists photo_captured_at timestamptz;

comment on column public.action_logs.auto_verify_status is
  '자동검증 결과 status. 기본 passed(친구 신뢰). 서버(검증 RPC/service_role)만 변경. peer_rejected=WP5 다수결 반려(카운트 제외). ADR-0032 §4.';
comment on column public.action_logs.auto_verify_score is
  '결정론 부정 신호 점수(메타). 서버 전용. 사진/일기 본문은 저장하지 않는다.';
comment on column public.action_logs.auto_verify_model_version is
  '검증 로직/모델 버전 marker(이벤트 조인 분석용). 서버 전용.';
comment on column public.action_logs.photo_phash is
  'perceptual hash — 사진 재사용·중복 검출 메타(AC-cheat-detect-1). 원본 미저장. 서버 전용.';
comment on column public.action_logs.photo_captured_at is
  'EXIF 촬영시각 — 촬영-제출 시각 불일치 신호용 메타. 서버 전용.';

-- ============================================================
-- B. 가드 확장 — 검증 컬럼군을 AI 컬럼과 동일하게 서버 전용으로 (exception ①)
-- ============================================================
-- 기존 prevent_ai_column_update(0002)에 검증 5컬럼을 추가한다 — 새 메커니즘이 아니라 동일 가드의 확장.
-- 허용 경로는 0044(정산 가드)와 동일하게 2가지: ① service_role 직접 write(BFF/cron)
--   ② SECURITY DEFINER 검증 RPC(트리거 시점 current_user 가 함수 소유자라 anon/authenticated 가 아님).
-- 0002 의 service_role 단독 검사는 WP2 의 authenticated-invoked definer RPC 를 막으므로(0044 가 동일 버그를
--   정산 RPC 에서 고침) dual-guard 채택. 이로써 클라 직접 검증 컬럼 위조 UPDATE 는 42501 로 거부되고,
--   검증 status 의 사후 UPDATE(비동기 확정·override)는 서버 경로에서만 가능하다(immutability 예외 ①).
-- INSERT 시 검증 컬럼은 default(status='passed', 나머지 NULL)로 시작하며 판정 RPC(WP2)가 유일한 writer 다.
--   INSERT 위조는 공격가치가 없다 — 'passed' 가 이미 최관대 status 이고 phash/score 는 WP2 가 서버에서 재계산한다.
--   따라서 0002 패턴 그대로 UPDATE 경로만 가드한다.
create or replace function public.prevent_ai_column_update()
returns trigger
language plpgsql as $$
declare
  v_server boolean;
begin
  if new.ai_summary is distinct from old.ai_summary
     or new.template_fallback is distinct from old.template_fallback
     or new.regenerate_count is distinct from old.regenerate_count
     or new.prompt_version is distinct from old.prompt_version
     or new.auto_verify_status is distinct from old.auto_verify_status
     or new.auto_verify_score is distinct from old.auto_verify_score
     or new.auto_verify_model_version is distinct from old.auto_verify_model_version
     or new.photo_phash is distinct from old.photo_phash
     or new.photo_captured_at is distinct from old.photo_captured_at
  then
    v_server :=
      coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') = 'service_role'
      or current_user not in ('anon', 'authenticated');
    if not v_server then
      raise exception 'action_logs AI/verification columns are server-managed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
-- 트리거 al_guard_ai_columns(0002)는 위 함수를 그대로 가리키므로 재생성 불필요(create or replace 로 본문만 갱신).

-- ============================================================
-- C. 본문 immutability + 예외 2가지만 (exception ②)
-- ============================================================
-- action_logs 본문(키워드·종류·식별자·작성시각)은 작성 후 불변(ledger immutability, ADR-0032).
-- 예외는 단 2가지: ① 검증 status 컬럼군 서버 UPDATE(위 B 가드가 담당) ② 마감 전 사진 교체(photo_path).
-- 본 트리거는 "본문 컬럼 변경 거부 + photo_path 만 교체 허용" 을 모든 role 에 일관 강제한다(service_role 포함).
--   → 검증/AI 컬럼은 B 가드가 별도 처리하므로 본 트리거 대상이 아니다(여기서 거부하면 exception ①이 깨진다).
--   → photo_path·edited_at 은 immutable 목록에서 제외 = 사진 교체 허용(예외 ②). '마감 전·1회' 한정과
--     교체 시 부정탐지 재실행은 WP4(EVAL-0024) — 본 task 는 교체 *허용* 구조까지.
-- 현재 action_logs 는 앱에서 INSERT 전용(UPDATE 호출 경로 없음)이라 본문 잠금은 런타임 회귀 위험이 없다.
--   기존 al_update_self_5min(본인 5분 창) 정책은 유지하되, 그 창 안에서도 변경 가능 컬럼은 photo_path 로 좁아진다.
create or replace function public.prevent_action_log_body_mutation()
returns trigger
language plpgsql as $$
begin
  if new.challenge_id is distinct from old.challenge_id
     or new.user_id is distinct from old.user_id
     or new.activity_type is distinct from old.activity_type
     or new.selected_keywords is distinct from old.selected_keywords
     or new.shown_keywords is distinct from old.shown_keywords
     or new.reroll_count is distinct from old.reroll_count
     or new.memo is distinct from old.memo
     or new.created_at is distinct from old.created_at
  then
    raise exception 'action_logs body is immutable (only photo replacement and verification status may change)'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists al_guard_body_immutable on public.action_logs;
create trigger al_guard_body_immutable
  before update on public.action_logs
  for each row execute function public.prevent_action_log_body_mutation();

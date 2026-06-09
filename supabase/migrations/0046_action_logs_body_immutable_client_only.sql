-- supabase/migrations/0046_action_logs_body_immutable_client_only.sql
-- 0045 forward-fix (EVAL-0020) — 본문 immutability 를 *클라(anon/authenticated) 전용* 으로 좁힌다.
--
-- 0045 의 prevent_action_log_body_mutation 은 created_at 포함 본문 변경을 **모든 role 에서** 거부했는데,
-- 이는 서버 경로 작업을 깨뜨렸다:
--   ① 기존 update_action_log_photo_path RPC(0011, SECURITY DEFINER)는 photo_path 만 바꿔 무사했지만,
--   ② service_role(admin) 의 created_at backfill/보정(운영·테스트 fixture)이 42501 로 막혔다
--      (예: action-photos 통합테스트의 5분-창 시뮬레이션용 created_at backdate).
-- ADR-0032 §Alternatives 3 의 "immutability 는 '클라가 못 바꾼다' 로 충분히 지켜진다(서버 전용 예외)"
-- 원칙에 맞춰, 본문 immutability 의 enforcement 대상을 클라로 한정한다.
--
-- bypass(서버) 경로는 컬럼 가드(0045 §B)·정산 가드(0044)와 동일한 dual-guard 2경로:
--   ① service_role 직접 write ② SECURITY DEFINER RPC(트리거 시점 current_user = 함수 소유자).
-- forward-only: 0045 가 트리거 al_guard_body_immutable 를 이미 설치했으므로 함수 본문만 교체한다.
-- 클라(anon/authenticated)에 대한 본문(키워드·종류·식별자·created_at) immutability + photo_path 교체
-- 허용(예외 ②)은 그대로 유지된다.
create or replace function public.prevent_action_log_body_mutation()
returns trigger
language plpgsql as $$
declare
  v_server boolean;
begin
  v_server :=
    coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') = 'service_role'
    or current_user not in ('anon', 'authenticated');
  if v_server then
    return new;  -- 서버 경로(service_role / SECURITY DEFINER RPC)는 신뢰 — 본문 보정 허용
  end if;

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

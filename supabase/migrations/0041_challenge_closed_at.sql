-- supabase/migrations/0041_challenge_closed_at.sql
-- ADR-0030 — 조기 종료 정산 cutoff 산정용.
-- 종료 경로(endChallenge action · auto-close cron)가 status='closed' 전이와 함께
-- closed_at = now() 로 1회 set 한다. nullable — 진행 중/레거시 행은 NULL(폴백=duration_days).
-- RLS 변경 없음: 기존 challenges UPDATE 정책(challenges_update_pending_owner · admin client) 내에서 갱신.

alter table public.challenges
  add column if not exists closed_at timestamptz;

comment on column public.challenges.closed_at is
  '챌린지 종료(closed) 시각. 조기 종료 정산 cutoff 산정용. NULL=미종료 또는 레거시(폴백 duration_days).';

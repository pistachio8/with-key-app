-- 0032_meal_activity_type.sql
-- meal activity type 추가 (키워드 풀 v1.1 release).
-- ADR: docs/adr/0015-meal-activity-type.md
-- Spec: docs/superpowers/specs/2026-05-22-meal-activity-type.md
-- Plan: docs/superpowers/plans/2026-05-22-meal-activity-type.md
--
-- 0001_init.sql 의 action_logs.activity_type CHECK 제약을 drop + add 패턴으로
-- 갱신해 'meal' 을 허용한다. POC 단방향 정책 — down 스크립트 없음.

alter table public.action_logs
  drop constraint if exists action_logs_activity_type_check;

alter table public.action_logs
  add constraint action_logs_activity_type_check
  check (activity_type in ('running', 'gym', 'yoga', 'other', 'meal'));

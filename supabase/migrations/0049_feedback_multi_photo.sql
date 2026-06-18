-- 0049_feedback_multi_photo.sql — 건의 사진 멀티(최대 3). ADR-0035 amendment(사진 1→3, Slack 멀티 노출).
-- plan: docs/superpowers/plans/2026-06-18-feedback-multi-photo.md
-- 0047_feedback.sql(INSERT-only) 비파괴 확장 — RLS/status/열람 정책은 변경 없음.

alter table public.feedback
  add column if not exists photo_paths text[] not null default '{}'
    check (array_length(photo_paths, 1) is null or array_length(photo_paths, 1) <= 3);

-- 기존 단일 photo_path 백필. photo_path 는 삭제하지 않고 deprecated 보존(슬랙 단일 미리보기 하위호환).
update public.feedback
  set photo_paths = array[photo_path]
  where photo_path is not null and photo_paths = '{}';

comment on column public.feedback.photo_paths is
  'feedback-photos object paths "{userId}/{feedbackId}-{nonce}.{ext}" (최대 3). photo_path(단일)는 0049 이후 deprecated.';

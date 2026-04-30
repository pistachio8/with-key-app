-- 0010_action_logs_photo_path.sql — photo_url -> photo_path meaning change.
-- D-018: store private Storage object paths; allow no-photo fallback.

alter table public.action_logs
  rename column photo_url to photo_path;

alter table public.action_logs
  alter column photo_path drop not null;

alter table public.action_logs
  add constraint action_logs_photo_path_len_chk
  check (photo_path is null or char_length(photo_path) between 10 and 512);

comment on column public.action_logs.photo_path is
  'Storage object path "{userId}/{challengeId}/{actionLogId}-{nonce}.{ext}". NULL = submitted without a photo. Legacy https://example.com/... values may exist before reset.';

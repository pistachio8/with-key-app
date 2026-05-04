-- 0016_users_last_feed_seen_at.sql
-- PRD §7 · DESIGN_BRIEF §1.5 — 피드 미읽음 Kudos 배지용 last-seen 타임스탬프.
-- nullable: 기존 유저는 "첫 피드 진입 전" 상태. 모든 kudos 가 unread 로 집계되는 것이 의도.

alter table public.users
  add column if not exists last_feed_seen_at timestamptz;

-- 배지 쿼리: kudos.created_at > users.last_feed_seen_at.
-- 기존 idx_kudos_action_log 로는 created_at 범위 필터가 covering 되지 않으므로 created_at 단독 인덱스 추가.
create index if not exists idx_kudos_created_at on public.kudos(created_at);

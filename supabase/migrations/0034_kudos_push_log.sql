-- 0034_kudos_push_log.sql
-- ADR-0017 참조. kudos 받음 push 발송 dedup. PK(recipient, action_log, actor) UNIQUE 로 race-free.
-- events 5분 윈도우의 fire-and-forget INSERT race 영구 해소.

create table public.kudos_push_log (
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  action_log_id     uuid not null references public.action_logs(id) on delete cascade,
  actor_user_id     uuid not null references public.users(id) on delete cascade,
  sent_at           timestamptz not null default now(),
  primary key (recipient_user_id, action_log_id, actor_user_id)
);

comment on table public.kudos_push_log is
  'kudos 받음 push 발송 dedup. PK(recipient,action_log,actor) UNIQUE 로 race-free. ADR-0017.';

-- RLS: service_role 만 접근. anon/authenticated 차단.
-- 명시적 정책 미부여 = anon/authenticated 0 row.
-- 본인 받은 push 이력 UI 가 생기면 그때 recipient SELECT 정책 추가 (follow-up).
alter table public.kudos_push_log enable row level security;

-- cleanup cron (90d TTL) 의 range scan 용 — sent_at desc.
create index idx_kudos_push_log_sent_at on public.kudos_push_log (sent_at desc);

-- shared remote project 에서 새 테이블 추가 후 PostgREST schema cache 즉시 reload —
-- CI 의 integration job 가 apply-migrations 직후 spec 실행하므로 cache lag 회피.
notify pgrst, 'reload schema';

-- 0001_init.sql — BE_SCHEMA §5/§6 구체화.
-- 테이블 10개 + 제약 + 인덱스. RLS 정책은 0002_rls.sql.
-- 원칙: forward-only (ONBOARDING §4.3). 재실행 전제 X.

-- ============================================================
-- 1. users (auth.users 확장)
-- ============================================================
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 20),
  avatar_url text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 2. groups
-- ============================================================
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id),
  name text check (char_length(name) between 1 and 30),
  status text not null default 'active' check (status in ('active','disbanded')),
  disbanded_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 3. group_members
-- ============================================================
create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.users(id),
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- BE_SCHEMA_RLS §2: users SELECT 정책의 group-intersection 가속.
create index idx_group_members_user_group on public.group_members(user_id, group_id);

-- ============================================================
-- 4. invites
-- ============================================================
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null default (now() + interval '72 hours'),
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);

create index idx_invites_token on public.invites(token);

-- ============================================================
-- 5. challenges
-- ============================================================
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  title text not null check (char_length(title) between 1 and 30),
  type text not null default 'fitness' check (type in ('fitness')),
  goal_count int not null default 3 check (goal_count between 1 and 7),
  duration_days int not null default 7 check (duration_days between 1 and 90),
  penalty_amount int not null
    check (penalty_amount between 1000 and 10000 and penalty_amount % 1000 = 0),
  status text not null default 'pending'
    check (status in ('pending','accepted','active','closed')),
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_challenges_group_status on public.challenges(group_id, status);

-- ============================================================
-- 6. challenge_participants
-- ============================================================
create table public.challenge_participants (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.users(id),
  signed_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

-- ============================================================
-- 7. action_logs (+ AI 컬럼 흡수)
-- ============================================================
create table public.action_logs (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id),
  user_id uuid not null references public.users(id),
  activity_type text not null check (activity_type in ('running','gym','yoga','other')),
  photo_url text not null,
  selected_keywords text[] not null check (array_length(selected_keywords, 1) between 1 and 3),
  shown_keywords text[] not null,
  reroll_count int not null default 0 check (reroll_count between 0 and 5),
  memo text check (char_length(memo) <= 100),
  ai_summary text not null check (char_length(ai_summary) <= 150),
  template_fallback boolean not null default false,
  regenerate_count int not null default 0 check (regenerate_count between 0 and 2),
  prompt_version text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index idx_action_logs_challenge_user_created
  on public.action_logs(challenge_id, user_id, created_at desc);
create index idx_action_logs_user_created
  on public.action_logs(user_id, created_at desc);
create index idx_action_logs_keywords_gin
  on public.action_logs using gin (selected_keywords);

-- ============================================================
-- 8. kudos
-- ============================================================
create table public.kudos (
  id uuid primary key default gen_random_uuid(),
  action_log_id uuid not null references public.action_logs(id) on delete cascade,
  user_id uuid not null references public.users(id),
  emoji text not null check (emoji in ('🔥','💪','👏')),
  created_at timestamptz not null default now(),
  unique (action_log_id, user_id, emoji)
);

create index idx_kudos_action_log on public.kudos(action_log_id);

-- ============================================================
-- 9. push_subscriptions
-- ============================================================
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index idx_push_sub_user on public.push_subscriptions(user_id);

-- ============================================================
-- 10. events
-- ============================================================
create table public.events (
  id bigint generated always as identity primary key,
  user_id uuid references public.users(id),
  name text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_events_name_created on public.events(name, created_at desc);

-- ============================================================
-- Auto-provision public.users on auth.users insert
-- ============================================================
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

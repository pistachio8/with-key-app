-- 0002_rls.sql — Row Level Security.
-- BE_SCHEMA_RLS.md §1 의 predicate 를 SQL 로 옮김. 전 테이블 ON (ONBOARDING §6.1).

-- ============================================================
-- 헬퍼
-- ============================================================
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql stable security invoker
set search_path = public as $$
  select exists(
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

-- ============================================================
-- users
-- ============================================================
alter table public.users enable row level security;

create policy users_select_self_or_group on public.users
  for select using (
    id = auth.uid()
    or exists (
      select 1
      from public.group_members gm1
      join public.group_members gm2 on gm1.group_id = gm2.group_id
      where gm1.user_id = auth.uid() and gm2.user_id = public.users.id
    )
  );

create policy users_insert_self on public.users
  for insert with check (id = auth.uid());

create policy users_update_self on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ============================================================
-- groups
-- ============================================================
alter table public.groups enable row level security;

create policy groups_select_member on public.groups
  for select using (public.is_group_member(id));

create policy groups_insert_owner_self on public.groups
  for insert with check (owner_id = auth.uid());

create policy groups_update_owner on public.groups
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ============================================================
-- group_members
-- ============================================================
alter table public.group_members enable row level security;

create policy gm_select_member on public.group_members
  for select using (public.is_group_member(group_id));

-- INSERT: service_role 만. anon/authenticated 기본 deny (정책 없음).

create policy gm_delete_self_or_owner on public.group_members
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  );

-- ============================================================
-- invites
-- ============================================================
alter table public.invites enable row level security;

create policy invites_select_owner on public.invites
  for select using (
    exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  );

create policy invites_insert_owner on public.invites
  for insert with check (
    exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  );

create policy invites_delete_owner on public.invites
  for delete using (
    exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  );

-- ============================================================
-- challenges
-- ============================================================
alter table public.challenges enable row level security;

create policy challenges_select_member on public.challenges
  for select using (public.is_group_member(group_id));

create policy challenges_insert_owner on public.challenges
  for insert with check (
    exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  );

create policy challenges_update_pending_owner on public.challenges
  for update
  using (
    status = 'pending'
    and exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  )
  with check (
    status in ('pending','accepted')
    and exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  );

-- ============================================================
-- challenge_participants
-- ============================================================
alter table public.challenge_participants enable row level security;

create policy cp_select_member on public.challenge_participants
  for select using (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_id and public.is_group_member(c.group_id)
    )
  );

-- INSERT: service_role 만.

create policy cp_update_self_sign on public.challenge_participants
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- action_logs
-- ============================================================
alter table public.action_logs enable row level security;

create policy al_select_member on public.action_logs
  for select using (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_id and public.is_group_member(c.group_id)
    )
  );

create policy al_insert_self_active on public.action_logs
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.challenges c
      where c.id = challenge_id
        and c.status = 'active'
        and now() between c.start_at and c.end_at
    )
  );

create policy al_update_self_5min on public.action_logs
  for update
  using (user_id = auth.uid() and created_at > now() - interval '5 minutes')
  with check (user_id = auth.uid() and created_at > now() - interval '5 minutes');

-- 트리거: AI 컬럼 클라이언트 수정 차단.
create or replace function public.prevent_ai_column_update()
returns trigger
language plpgsql as $$
declare
  v_role text;
begin
  if new.ai_summary is distinct from old.ai_summary
     or new.template_fallback is distinct from old.template_fallback
     or new.regenerate_count is distinct from old.regenerate_count
     or new.prompt_version is distinct from old.prompt_version
  then
    v_role := coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '');
    if v_role <> 'service_role' then
      raise exception 'action_logs AI columns are server-managed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger al_guard_ai_columns
  before update on public.action_logs
  for each row execute function public.prevent_ai_column_update();

-- ============================================================
-- kudos
-- ============================================================
alter table public.kudos enable row level security;

create policy kudos_select_member on public.kudos
  for select using (
    exists (
      select 1 from public.action_logs a
      join public.challenges c on c.id = a.challenge_id
      where a.id = action_log_id and public.is_group_member(c.group_id)
    )
  );

create policy kudos_insert_self_not_own on public.kudos
  for insert with check (
    user_id = auth.uid()
    and not exists (
      select 1 from public.action_logs a
      where a.id = action_log_id and a.user_id = auth.uid()
    )
    and exists (
      select 1 from public.action_logs a
      join public.challenges c on c.id = a.challenge_id
      where a.id = action_log_id and public.is_group_member(c.group_id)
    )
  );

create policy kudos_delete_self on public.kudos
  for delete using (user_id = auth.uid());

-- ============================================================
-- push_subscriptions
-- ============================================================
alter table public.push_subscriptions enable row level security;

create policy ps_all_self on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- events
-- ============================================================
alter table public.events enable row level security;

create policy events_insert_self_or_anon on public.events
  for insert with check (user_id = auth.uid() or user_id is null);
-- SELECT/UPDATE/DELETE: service_role 전용 (정책 없음 = deny).

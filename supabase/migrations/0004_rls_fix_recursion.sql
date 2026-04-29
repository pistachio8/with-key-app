-- 0004_rls_fix_recursion.sql — 정책 재귀(54001 stack depth) 제거.
--
-- 문제:
--   `groups_select_member` → `is_group_member(id)` → `group_members` SELECT
--   `group_members_select` → `is_group_member(group_id)` → 재귀
-- 해결:
--   1) is_group_member 를 security definer 로 변경(함수 내부는 RLS 우회).
--   2) group_members SELECT 정책을 직접 조건(user_id = auth.uid()) + is_group_member 조합으로 분리.
--   3) 다른 security definer 헬퍼 __group_is_owner 로 groups 소유권 확인 정책도 단순화.

-- --------------------------------------------------
-- is_group_member: security definer 로 재정의
-- --------------------------------------------------
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql stable security definer
set search_path = public as $$
  select exists(
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

-- --------------------------------------------------
-- is_group_owner: security definer
-- --------------------------------------------------
create or replace function public.is_group_owner(gid uuid)
returns boolean
language sql stable security definer
set search_path = public as $$
  select exists(
    select 1 from public.groups
    where id = gid and owner_id = auth.uid()
  );
$$;

-- --------------------------------------------------
-- group_members SELECT: 직접 조건
--   A) 자기 행 조회  OR  B) 내가 멤버인 그룹의 다른 멤버 조회(같은 그룹 교차)
-- is_group_member 함수는 security definer 라 RLS 우회 → 재귀 끊김
-- --------------------------------------------------
drop policy if exists gm_select_member on public.group_members;

create policy gm_select_same_group on public.group_members
  for select using (public.is_group_member(group_id));

-- --------------------------------------------------
-- groups insert/update: is_group_owner 사용(security definer → 재귀 끊김)
-- 기존 owner_id = auth.uid() 와 동치이지만, 다른 정책과 톤 맞춤.
-- --------------------------------------------------
-- groups_select_member 는 is_group_member(id) 를 사용 중 → security definer 덕에 안전.

-- --------------------------------------------------
-- invites: EXISTS(groups ...) 서브쿼리 대신 is_group_owner 사용
-- --------------------------------------------------
drop policy if exists invites_select_owner on public.invites;
drop policy if exists invites_insert_owner on public.invites;
drop policy if exists invites_delete_owner on public.invites;

create policy invites_select_owner on public.invites
  for select using (public.is_group_owner(group_id));

create policy invites_insert_owner on public.invites
  for insert with check (public.is_group_owner(group_id));

create policy invites_delete_owner on public.invites
  for delete using (public.is_group_owner(group_id));

-- --------------------------------------------------
-- challenges: is_group_owner 사용
-- --------------------------------------------------
drop policy if exists challenges_insert_owner on public.challenges;
drop policy if exists challenges_update_pending_owner on public.challenges;

create policy challenges_insert_owner on public.challenges
  for insert with check (public.is_group_owner(group_id));

create policy challenges_update_pending_owner on public.challenges
  for update
  using (status = 'pending' and public.is_group_owner(group_id))
  with check (status in ('pending','accepted') and public.is_group_owner(group_id));

-- --------------------------------------------------
-- group_members DELETE: is_group_owner 사용
-- --------------------------------------------------
drop policy if exists gm_delete_self_or_owner on public.group_members;

create policy gm_delete_self_or_owner on public.group_members
  for delete using (
    user_id = auth.uid() or public.is_group_owner(group_id)
  );

-- 0030_groups_owner_delete_policy.sql
--
-- Safe group deletion is application-gated to owner + one member + zero challenges.
-- RLS still needs an owner-only DELETE surface so authenticated owners can delete
-- rows that pass those application-level checks.

create policy groups_delete_owner on public.groups
  for delete using (owner_id = auth.uid());

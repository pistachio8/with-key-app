-- supabase/migrations/0042_point_ledger.sql
-- ADR-0032 / EVAL-0005 — append-only 포인트 원장 + 보증금 read cache.
-- 잔액 SoT 는 public.point_ledger 의 SUM(delta) 이며 balance 컬럼은 두지 않는다.

alter table public.challenge_participants
  add column if not exists deposit_points integer not null default 0
  check (deposit_points >= 0);

comment on column public.challenge_participants.deposit_points is
  '보증금 hold 금액의 게이지 read용 denormalized cache. SoT는 point_ledger SUM(delta).';

create or replace function public.prevent_challenge_participants_deposit_points_write()
returns trigger
language plpgsql as $$
declare
  v_role text;
begin
  v_role := coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '');

  if tg_op = 'INSERT' then
    if coalesce(new.deposit_points, 0) <> 0 and v_role <> 'service_role' then
      raise exception 'challenge_participants.deposit_points is server-managed'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.deposit_points is distinct from old.deposit_points
     and v_role <> 'service_role' then
    raise exception 'challenge_participants.deposit_points is server-managed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger cp_guard_deposit_points
  before insert or update on public.challenge_participants
  for each row execute function public.prevent_challenge_participants_deposit_points_write();

create table public.point_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  group_id uuid not null references public.groups(id),
  challenge_id uuid references public.challenges(id),
  delta integer not null check (delta <> 0),
  reason text not null
    check (reason in (
      'bundle_grant',
      'deposit_hold',
      'deposit_release',
      'penalty',
      'distribution',
      'refund'
    )),
  ref_id uuid,
  created_at timestamptz not null default now()
);

comment on table public.point_ledger is
  'Append-only 포인트 원장. 잔액은 user/group scope SUM(delta)로만 도출한다.';
comment on column public.point_ledger.ref_id is
  '원천 행(settlements.challenge_id, RPC idempotency key 등) 추적용 heterogeneous reference.';

create index idx_point_ledger_user_group_created
  on public.point_ledger(user_id, group_id, created_at desc);
create index idx_point_ledger_group_created
  on public.point_ledger(group_id, created_at desc);
create index idx_point_ledger_challenge
  on public.point_ledger(challenge_id)
  where challenge_id is not null;
create index idx_point_ledger_ref
  on public.point_ledger(ref_id)
  where ref_id is not null;

alter table public.point_ledger enable row level security;

create policy point_ledger_select_self_or_group on public.point_ledger
  for select using (
    user_id = auth.uid()
    or public.is_group_member(group_id)
  );

create or replace function public.prevent_point_ledger_direct_write()
returns trigger
language plpgsql as $$
declare
  v_role text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'point_ledger is append-only' using errcode = '42501';
  end if;

  v_role := coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '');
  if v_role <> 'service_role' then
    raise exception 'point_ledger writes are server-managed' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger point_ledger_guard_writes
  before insert or update or delete on public.point_ledger
  for each row execute function public.prevent_point_ledger_direct_write();

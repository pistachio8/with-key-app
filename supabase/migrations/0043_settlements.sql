-- supabase/migrations/0043_settlements.sql
-- ADR-0032 / EVAL-0005 — 불변 정산 스냅샷.
-- challenge_id PK 로 1챌린지 1정산을 스키마 레벨에서 강제한다.

create table public.settlements (
  challenge_id uuid primary key references public.challenges(id),
  settled_at timestamptz not null default now(),
  settled_by text not null check (settled_by in ('owner', 'auto')),
  pool_points integer not null check (pool_points >= 0),
  distribution jsonb not null default '{}'::jsonb
);

comment on table public.settlements is
  '챌린지별 불변 정산 스냅샷. challenge_id PK 로 이중 정산을 차단한다.';
comment on column public.settlements.distribution is
  '정산 확정 시점의 분배 스냅샷. 사후 멤버십/벌금 모델 변경으로 재계산하지 않는다.';

create index idx_settlements_settled_at
  on public.settlements(settled_at desc);

alter table public.settlements enable row level security;

create policy settlements_select_member on public.settlements
  for select using (
    exists (
      select 1
      from public.challenges c
      where c.id = challenge_id and public.is_group_member(c.group_id)
    )
  );

create or replace function public.prevent_settlements_direct_write()
returns trigger
language plpgsql as $$
declare
  v_role text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'settlements are immutable' using errcode = '42501';
  end if;

  v_role := coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '');
  if v_role <> 'service_role' then
    raise exception 'settlements writes are server-managed' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger settlements_guard_writes
  before insert or update or delete on public.settlements
  for each row execute function public.prevent_settlements_direct_write();

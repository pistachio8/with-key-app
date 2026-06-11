-- 0047_feedback.sql — 개발자에게 건의하기: feedback 테이블 + feedback-photos 버킷 + RLS.
-- spec: docs/superpowers/specs/2026-06-10-feedback-suggestion-design.md
-- ADR : docs/adr/0035-feedback-table-storage.md

-- ============================================================
-- 1. feedback 테이블 (13번째)
-- ============================================================
create table public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  category   text not null check (category in ('bug','feature','other')),
  body       text not null check (char_length(body) between 1 and 1000),
  photo_path text,
  created_at timestamptz not null default now()
);

comment on column public.feedback.photo_path is
  'feedback-photos bucket object path "{userId}/{feedbackId}-{nonce}.{ext}". NULL = no photo.';

alter table public.feedback enable row level security;

-- INSERT-only: 앱에 열람 화면이 없어 SELECT/UPDATE/DELETE 정책을 두지 않는다.
-- 개발자 조회는 Supabase Studio(service_role). insert 후 .select() 체이닝은 RLS 에 막히므로
-- Server Action 이 id 를 randomUUID() 로 선생성한다.
drop policy if exists feedback_insert_self on public.feedback;
create policy feedback_insert_self on public.feedback
  for insert to authenticated
  with check (user_id = auth.uid());

-- ============================================================
-- 2. private feedback-photos 버킷
--    action-photos 재사용 불가: 그쪽 SELECT 정책이 챌린지 그룹 멤버 기준.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feedback-photos',
  'feedback-photos',
  false,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================
-- 3. storage.objects RLS — owner-scoped
--    path: {userId}/{feedbackId}-{nonce}.{ext} (2-segment, foldername[1] = userId)
-- ============================================================
drop policy if exists fp_insert_self on storage.objects;
create policy fp_insert_self on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'feedback-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists fp_select_self on storage.objects;
create policy fp_select_self on storage.objects
  for select to authenticated
  using (
    bucket_id = 'feedback-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists fp_delete_self on storage.objects;
create policy fp_delete_self on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'feedback-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- 4. truncate_test_data 재발행 — 0012 정의 전문 보존 + feedback 확장 2곳:
--    (a) storage delete 의 bucket 스코프에 feedback-photos 추가
--    (b) delete from public.feedback (auth.users 삭제 이전)
--    참고: point_ledger·settlements 미정리는 기존 잠복 결함 — 본 migration 범위 외,
--    ADR-0035 에 인지 기록 (별도 forward-fix).
-- ============================================================
create or replace function public.truncate_test_data()
returns void
language plpgsql security definer
set search_path = public, storage as $$
declare
  v_test_user_ids uuid[];
begin
  select coalesce(array_agg(id), array[]::uuid[]) into v_test_user_ids
    from auth.users where email like '%@test.local';

  if array_length(v_test_user_ids, 1) is not null then
    -- Bypass storage.protect_delete trigger (session-local; service_role only).
    perform set_config('storage.allow_delete_query', 'true', true);

    delete from storage.objects
      where bucket_id in ('action-photos', 'feedback-photos')
        and (storage.foldername(name))[1] in (
          select unnest(v_test_user_ids)::text
        );

    delete from public.feedback where user_id = any(v_test_user_ids);
    delete from public.kudos where user_id = any(v_test_user_ids);
    delete from public.action_logs where user_id = any(v_test_user_ids);
    delete from public.challenge_participants where user_id = any(v_test_user_ids);
    delete from public.challenges where group_id in (
      select id from public.groups where owner_id = any(v_test_user_ids)
    );
    delete from public.invites where created_by = any(v_test_user_ids);
    delete from public.group_members where user_id = any(v_test_user_ids);
    delete from public.groups where owner_id = any(v_test_user_ids);
    delete from public.push_subscriptions where user_id = any(v_test_user_ids);
    delete from public.events where user_id = any(v_test_user_ids);
    delete from auth.users where id = any(v_test_user_ids);
  end if;

  -- D-017: anon events (user_id IS NULL) within 24h — test anon leaks only,
  -- preserve older prod analytics.
  delete from public.events
    where user_id is null
      and created_at > now() - interval '24 hours';

  -- D-017: reset scope='test' current-month AI cost accumulator.
  update public.ai_cost_log
    set total_micros = 0, updated_at = now()
    where month = date_trunc('month', now() at time zone 'utc')::date
      and scope = 'test';
end;
$$;

revoke all on function public.truncate_test_data() from public, anon, authenticated;
grant execute on function public.truncate_test_data() to service_role;

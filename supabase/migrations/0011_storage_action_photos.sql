-- 0011_storage_action_photos.sql — private action photo Storage + RLS + path RPC.

-- ============================================================
-- 1. Private bucket
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'action-photos',
  'action-photos',
  false,
  5 * 1024 * 1024,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================
-- 2. RLS policies on storage.objects
--    path: {userId}/{challengeId}/{actionLogId}-{nonce}.{ext}
-- ============================================================

drop policy if exists ap_select_group_member on storage.objects;
create policy ap_select_group_member on storage.objects
  for select to authenticated
  using (
    bucket_id = 'action-photos'
    and exists (
      select 1
      from public.challenges c
      where c.id::text = (storage.foldername(name))[2]
        and public.is_group_member(c.group_id)
    )
  );

drop policy if exists ap_insert_self on storage.objects;
create policy ap_insert_self on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'action-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- No UPDATE policy: uploaded photo objects are immutable in v1.

drop policy if exists ap_delete_self on storage.objects;
create policy ap_delete_self on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'action-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- 3. update_action_log_photo_path RPC
--    Bypasses the 5-minute action_logs update policy, but restores
--    the auth boundary inside the function and only mutates photo_path.
-- ============================================================
create or replace function public.update_action_log_photo_path(
  p_log_id uuid,
  p_photo_path text
)
returns void
language plpgsql security definer
set search_path = public as $$
declare
  v_owner uuid;
  v_challenge_id uuid;
  v_filename text;
begin
  select user_id, challenge_id
    into v_owner, v_challenge_id
    from public.action_logs
    where id = p_log_id;

  if v_owner is null then
    raise exception 'action_log not found' using errcode = 'P0002';
  end if;

  if v_owner <> auth.uid() then
    raise exception 'not owner' using errcode = '42501';
  end if;

  if p_photo_path is not null then
    if char_length(p_photo_path) not between 10 and 512 then
      raise exception 'invalid photo_path length' using errcode = '22023';
    end if;

    if split_part(p_photo_path, '/', 1) <> v_owner::text
       or split_part(p_photo_path, '/', 2) <> v_challenge_id::text then
      raise exception 'photo_path does not match action_log owner/challenge' using errcode = '42501';
    end if;

    v_filename := split_part(p_photo_path, '/', 3);
    if v_filename !~ ('^' || p_log_id::text || '-[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp|heic|heif)$') then
      raise exception 'invalid photo_path filename' using errcode = '22023';
    end if;
  end if;

  update public.action_logs
    set photo_path = p_photo_path
    where id = p_log_id;
end;
$$;

revoke all on function public.update_action_log_photo_path(uuid, text) from public, anon;
grant execute on function public.update_action_log_photo_path(uuid, text) to authenticated, service_role;

-- ============================================================
-- 4. truncate_test_data extension — adds Storage object cleanup while
--    preserving D-017 guarantees (ai_cost_log scope='test' reset,
--    user_id IS NULL events 24h cleanup).
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
    -- D-018: Storage objects owned by test users (path 1st segment = userId).
    delete from storage.objects
      where bucket_id = 'action-photos'
        and (storage.foldername(name))[1] in (
          select unnest(v_test_user_ids)::text
        );

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
  -- preserve older prod analytics. Run unconditionally so it does not depend
  -- on there being any @test.local users.
  delete from public.events
    where user_id is null
      and created_at > now() - interval '24 hours';

  -- D-017: reset scope='test' current-month AI cost accumulator; prod scope
  -- is untouched so shared Supabase project stays safe.
  update public.ai_cost_log
    set total_micros = 0, updated_at = now()
    where month = date_trunc('month', now() at time zone 'utc')::date
      and scope = 'test';
end;
$$;

revoke all on function public.truncate_test_data() from public, anon, authenticated;
grant execute on function public.truncate_test_data() to service_role;

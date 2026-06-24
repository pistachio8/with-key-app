-- supabase/migrations/0054_action_videos.sql
-- spec: docs/superpowers/specs/2026-06-23-feed-type-penalty-redesign-design.md §C2 (영상 인증) / EVAL-0043 (Rollout ②).
-- ADR-0024(admin hydrate cache 경계) · ADR-0032(verification data model).
--
-- 본 migration 이 하는 일:
--   A. 신규 private 버킷 action-videos (action-photos 패턴 미러, MIME=video/mp4·video/webm).
--   B. storage.objects RLS — select=그룹 멤버 · insert/delete=self 폴더(action-photos 의 ap_* 미러).
--   C. action_logs 영상 컬럼 추가 — media_type(not null default 'photo'), video_path(nullable).
--      기존 행은 default 로 자동 backfill(media_type='photo', video_path=null).
--   D. 불변 트리거 갱신 — prevent_action_log_body_mutation 의 금지 컬럼 목록에 media_type 추가
--      (클라가 photo↔video 위조 차단). video_path 는 제외(마감 전 교체 허용, photo_path 와 동일).
--   E. update_action_log_video_path RPC — photo_path 의 update_action_log_photo_path(0011) 대응.
--   F. truncate_test_data — 0053 정의 보존 + storage 정리 버킷에 action-videos 추가.
--
-- 번호: append-only(재정렬 금지). spec(§Rollout) 작성 시점 예약번호는 0052 였으나 0052·0053 이
--   먼저 머지(test cleanup)되어 next available 0054 로 재부여(spec line 37 규칙). forward-only(down 없음).
--   production apply 게이트는 0044·0050·0051 과 동일(G2). 컬럼 추가·신규 버킷은 기존 행/동작 무변(안전 기본값).

-- ============================================================
-- A. Private bucket action-videos
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'action-videos',
  'action-videos',
  false,
  20 * 1024 * 1024,
  array[
    'video/mp4',
    'video/webm'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================
-- B. RLS policies on storage.objects (action-photos ap_* 미러)
--    path: {userId}/{challengeId}/{actionLogId}-{nonce}.{ext}
-- ============================================================
drop policy if exists av_select_group_member on storage.objects;
create policy av_select_group_member on storage.objects
  for select to authenticated
  using (
    bucket_id = 'action-videos'
    and exists (
      select 1
      from public.challenges c
      where c.id::text = (storage.foldername(name))[2]
        and public.is_group_member(c.group_id)
    )
  );

drop policy if exists av_insert_self on storage.objects;
create policy av_insert_self on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'action-videos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- No UPDATE policy: uploaded video objects are immutable in v1 (photo 와 동일).

drop policy if exists av_delete_self on storage.objects;
create policy av_delete_self on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'action-videos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- C. action_logs 영상 컬럼 (NOT NULL DEFAULT → 기존 행 자동 backfill)
-- ============================================================
alter table public.action_logs
  add column if not exists media_type text not null default 'photo'
    check (media_type in ('photo', 'video'));

alter table public.action_logs
  add column if not exists video_path text
    check (video_path is null or char_length(video_path) between 10 and 512);

comment on column public.action_logs.media_type is
  '인증 medium(photo=사진/기존, video=실시간 3초 클립). challenges.feed_type 과 정합. 기본 photo 로 기존 행 보존. 불변(클라 위조 차단).';
comment on column public.action_logs.video_path is
  'action-videos 버킷 경로({userId}/{challengeId}/{actionLogId}-{nonce}.{ext}). photo_path 와 동형 — 마감 전 교체 허용(불변 예외).';

-- ============================================================
-- D. 불변성 트리거 갱신 — media_type 금지 추가, video_path 는 교체 허용
-- ============================================================
-- 0046 prevent_action_log_body_mutation 은 변경 금지 컬럼을 *열거*하므로 신규 컬럼은 기본 변경 허용
-- 상태가 된다. media_type 을 금지 목록에 추가(불변, photo↔video 위조 차단). video_path 는 제외 —
-- photo_path 와 동일하게 마감 전 교체 허용(서버/RPC 경로). 서버(service_role / SECURITY DEFINER RPC)
-- bypass 와 클라(anon/authenticated) 금지 경계는 0046 그대로 보존.
create or replace function public.prevent_action_log_body_mutation()
returns trigger
language plpgsql as $$
declare
  v_server boolean;
begin
  v_server :=
    coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') = 'service_role'
    or current_user not in ('anon', 'authenticated');
  if v_server then
    return new;  -- 서버 경로(service_role / SECURITY DEFINER RPC)는 신뢰 — 본문 보정 허용
  end if;

  if new.challenge_id is distinct from old.challenge_id
     or new.user_id is distinct from old.user_id
     or new.activity_type is distinct from old.activity_type
     or new.selected_keywords is distinct from old.selected_keywords
     or new.shown_keywords is distinct from old.shown_keywords
     or new.reroll_count is distinct from old.reroll_count
     or new.memo is distinct from old.memo
     or new.media_type is distinct from old.media_type
     or new.created_at is distinct from old.created_at
  then
    raise exception 'action_logs body is immutable (only photo/video path replacement and verification status may change)'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ============================================================
-- E. update_action_log_video_path RPC (update_action_log_photo_path[0011] 대응)
-- ============================================================
-- 직접 update 5분 창이 닫힌 뒤에도 owner 가 video_path 를 교체할 수 있게 하는 SECURITY DEFINER 우회.
-- 함수 내부에서 owner/challenge/파일명(video ext)을 재검증해 auth 경계를 복원한다.
create or replace function public.update_action_log_video_path(
  p_log_id uuid,
  p_video_path text
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

  if p_video_path is not null then
    if char_length(p_video_path) not between 10 and 512 then
      raise exception 'invalid video_path length' using errcode = '22023';
    end if;

    if split_part(p_video_path, '/', 1) <> v_owner::text
       or split_part(p_video_path, '/', 2) <> v_challenge_id::text then
      raise exception 'video_path does not match action_log owner/challenge' using errcode = '42501';
    end if;

    v_filename := split_part(p_video_path, '/', 3);
    if v_filename !~ ('^' || p_log_id::text || '-[A-Za-z0-9._-]+\.(mp4|webm)$') then
      raise exception 'invalid video_path filename' using errcode = '22023';
    end if;
  end if;

  update public.action_logs
    set video_path = p_video_path
    where id = p_log_id;
end;
$$;

revoke all on function public.update_action_log_video_path(uuid, text) from public, anon;
grant execute on function public.update_action_log_video_path(uuid, text) to authenticated, service_role;

-- ============================================================
-- F. truncate_test_data — 0053 정의 보존 + action-videos 버킷 정리 추가
-- ============================================================
-- 0053 정의 전문 보존 + storage 정리 bucket_id 목록에 action-videos 추가(테스트 영상 객체 누수 방지).
-- point_ledger/settlements DELETE 우회 게이트(app.test_cleanup + definer)는 0053 그대로 유지.
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
    -- append-only/immutable 가드의 DELETE 우회 활성(transaction-local; truncate_test_data 만 set).
    perform set_config('app.test_cleanup', 'on', true);

    delete from storage.objects
      where bucket_id in ('action-photos', 'action-videos', 'feedback-photos')
        and (storage.foldername(name))[1] in (
          select unnest(v_test_user_ids)::text
        );

    delete from public.feedback where user_id = any(v_test_user_ids);
    delete from public.kudos where user_id = any(v_test_user_ids);
    delete from public.action_logs where user_id = any(v_test_user_ids);

    -- point_ledger(append-only)·settlements(immutable) 는 challenges 를 FK 참조 → challenges 삭제 이전에
    -- 정리(ADR-0035 forward-fix). 가드 DELETE 우회는 위 app.test_cleanup flag + definer 컨텍스트로 열린다.
    delete from public.point_ledger where user_id = any(v_test_user_ids);
    delete from public.settlements where challenge_id in (
      select id from public.challenges where group_id in (
        select id from public.groups where owner_id = any(v_test_user_ids)
      )
    );

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

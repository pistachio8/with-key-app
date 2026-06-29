-- supabase/migrations/0059_action_videos_allow_mov.sql
-- action-videos 버킷 allowed_mime_types 에 video/quicktime(.mov) 추가 (RN iOS 카메라).
-- 왜: RN(apps/mobile) expo-image-picker 카메라 영상이 iOS 에서 .mov(quicktime)를 생성한다.
-- 0054 버킷은 mp4/webm 만 허용해 iOS 의 벌칙 증명·영상 인증 업로드가 storage 레벨에서 거부됐다.
-- spec 2026-06-29-rn-settlement-points-redemption-design §C2(영상 포맷 결정). 단방향(POC).
-- av_insert_self RLS 는 경로 prefix 만 검사하므로 RLS 변경 불요.
-- submit_penalty_proof RPC(0055)는 확장자를 검사하지 않으므로(길이+경로 segment) 변경 불요.
-- 단 같은 버킷의 영상 인증 교체 RPC update_action_log_video_path(0054)는 파일명 정규식으로
-- (mp4|webm)만 허용하므로, 버킷이 mov 를 열면 영상 인증 경로가 불일치한다 → 정규식도 (mp4|webm|mov)로 갱신.
-- 번호: append-only(재정렬 금지). production apply 게이트는 0054 와 동일(G2). MIME 추가는 기존 행/동작 무변.

-- ============================================================
-- A. 버킷 MIME 허용 확장 (전체 배열 재할당 — mp4/webm 반드시 포함).
-- ============================================================
update storage.buckets
  set allowed_mime_types = array['video/mp4', 'video/webm', 'video/quicktime']
  where id = 'action-videos';

-- ============================================================
-- B. 영상 인증 경로 교체 RPC — 0054 본문 보존 + 파일명 정규식만 (mp4|webm) → (mp4|webm|mov).
-- ============================================================
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
    if v_filename !~ ('^' || p_log_id::text || '-[A-Za-z0-9._-]+\.(mp4|webm|mov)$') then
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

-- supabase/migrations/0057_challenge_montages.sql
-- spec: docs/superpowers/specs/2026-06-23-feed-type-penalty-redesign-design.md §C6-B / EVAL-0046 (Rollout ⑤).
-- ADR-0040(feed-type-video-capture — 합본 몽타주 = Oracle A1 self-host ffmpeg 워커) · ADR-0024(admin hydrate 경계).
--
-- 본 migration 이 하는 일:
--   A. 신규 private 버킷 challenge-montages — 합본 몽타주 결과 mp4 의 저장소(action-videos 와 분리).
--      경로 {challengeId}/montage.mp4. mp4 전용(concat -c copy 출력, ADR-0040 캡처 표준화 전제).
--   B. storage.objects RLS — select = 그룹 멤버(challengeId → group membership). insert/delete 정책 부재.
--
-- 왜 전용 버킷인가: 결과 경로 {challengeId}/montage.{ext} 는 action-videos 의 {userId}/{challengeId}/...
--   규약과 다르고(challengeId 가 top folder), action-videos 재사용 시 recap read 가 admin client 를
--   써야 하는데 이는 ADR-0024(admin hydrate read 는 challenge-feed.ts callsite 한정)를 어긴다.
--   전용 버킷 + cm_select_group_member 정책이면 recap 이 viewer RLS user client 로 안전하게 read 한다
--   (challenge-videos.ts 와 동일한 RLS-gated read 경로).
--
-- 번호: append-only(재정렬 금지) · forward-only(down 없음). production apply 게이트 G2(0054 와 동일).
--   신규 버킷·정책 추가뿐이라 기존 행/동작 무변(안전 기본값).

-- ============================================================
-- A. Private bucket challenge-montages (mp4 전용)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'challenge-montages',
  'challenge-montages',
  false,
  100 * 1024 * 1024,
  array['video/mp4']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================
-- B. RLS policies on storage.objects
--    path: {challengeId}/montage.mp4  →  foldername(name)[1] = challengeId
-- ============================================================
-- select = 그룹 멤버. recap(viewer user client)이 그룹 멤버일 때만 signed URL 을 발급받는다.
drop policy if exists cm_select_group_member on storage.objects;
create policy cm_select_group_member on storage.objects
  for select to authenticated
  using (
    bucket_id = 'challenge-montages'
    and exists (
      select 1
      from public.challenges c
      where c.id::text = (storage.foldername(name))[1]
        and public.is_group_member(c.group_id)
    )
  );

-- insert/update/delete 정책 의도적 부재: 몽타주 객체는 Oracle A1 워커(service_role)만 생성·교체한다.
-- service_role 은 RLS 를 bypass 하므로 authenticated 용 write 정책이 불필요하고, 정책 부재 자체가
-- "PWA/authenticated 클라이언트는 몽타주를 직접 업로드·삭제할 수 없다" 를 강제한다(부정 업로드 차단).

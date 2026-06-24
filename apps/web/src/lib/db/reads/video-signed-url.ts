import { cacheLife, cacheTag } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";
import { looksLikeVideoPath } from "@/lib/storage/action-videos";

const BUCKET = "action-videos";
const SIGNED_TTL_SECONDS = 600; // 10분 — Storage createSignedUrl ttl 과 정합.

// Layer 2 (Video Signed URL). ADR-0024 — photo-signed-url.ts 패턴 복제.
// video path 별 signed URL. Supabase signed URL 만료 (10분) 와 cacheLife stale 정합.
//
// admin + public 'use cache': cookies 의존을 제거해 token endpoint 폭발(429)을 끊는다.
// signed URL 은 path 만으로 결정되는 viewer-agnostic 값이라 cached inner 는 videoPath 만
// 받아 모든 viewer 가 같은 cache entry 를 공유한다 (viewerId 가 cache key 에 들어가면
// cross-viewer 공유가 깨진다 — ADR-0024). 접근 제어는 Layer 1(listVisibleActionLogIds)이
// 비멤버 actionLog ID 를 거른 뒤 challenge-feed.ts 에서만 호출되는 contract 로 보장.
async function fetchSigned(videoPath: string): Promise<string | null> {
  "use cache";
  cacheTag(`video-${videoPath}`);
  cacheLife({
    stale: SIGNED_TTL_SECONDS - 60,
    revalidate: SIGNED_TTL_SECONDS - 120,
    expire: SIGNED_TTL_SECONDS,
  });

  if (!looksLikeVideoPath(videoPath)) return null;
  const supabase = adminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(videoPath, SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

// _viewerId 는 호출처 호환을 위해 유지하되 cached inner 로 전달하지 않는다 (ADR-0024).
export async function getActionLogVideoSignedUrl(
  videoPath: string | null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _viewerId: string,
): Promise<string | null> {
  if (!videoPath) return null;
  return fetchSigned(videoPath);
}

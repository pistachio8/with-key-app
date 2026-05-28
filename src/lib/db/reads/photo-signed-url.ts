import { cacheLife, cacheTag } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";
import { looksLikePhotoPath } from "@/lib/storage/action-photos";

const BUCKET = "action-photos";
const SIGNED_TTL_SECONDS = 600; // 10분 — Storage createSignedUrl ttl 과 정합.

// Phase 4 (SNS cache plan v4) — Layer 2 (Photo Signed URL). ADR-0024.
// photo path 별 signed URL. Supabase signed URL 만료 (10분) 와 cacheLife stale 정합.
// cacheLife stale: 540 (== 9분) — URL 이 expire 되기 전 fresh fetch 강제 (1분 buffer).
//
// admin + public 'use cache': cookies 의존을 제거해 token endpoint 폭발(429)을 끊는다.
// signed URL 은 path 만으로 결정되는 viewer-agnostic 값이라 cached inner 는 photoPath 만
// 받아 모든 viewer 가 같은 cache entry 를 공유한다 (viewerId 가 cache key 에 들어가면
// cross-viewer 공유가 깨진다 — ADR-0024). 접근 제어는 Layer 1(listVisibleActionLogIds)이
// 비멤버 actionLog ID 를 거른 뒤 challenge-feed.ts 에서만 호출되는 contract 로 보장.
async function fetchSigned(photoPath: string): Promise<string | null> {
  "use cache";
  cacheTag(`photo-${photoPath}`);
  cacheLife({
    stale: SIGNED_TTL_SECONDS - 60,
    revalidate: SIGNED_TTL_SECONDS - 120,
    expire: SIGNED_TTL_SECONDS,
  });

  if (!looksLikePhotoPath(photoPath)) return null;
  const supabase = adminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(photoPath, SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

// _viewerId 는 호출처 호환을 위해 유지하되 cached inner 로 전달하지 않는다 (ADR-0024).
export async function getActionLogPhotoSignedUrl(
  photoPath: string | null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _viewerId: string,
): Promise<string | null> {
  if (!photoPath) return null;
  return fetchSigned(photoPath);
}

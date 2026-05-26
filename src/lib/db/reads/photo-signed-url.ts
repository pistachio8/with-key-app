import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { looksLikePhotoPath } from "@/lib/storage/action-photos";

const BUCKET = "action-photos";
const SIGNED_TTL_SECONDS = 600; // 10분 — Storage createSignedUrl ttl 과 정합.

// Phase 4 (SNS cache plan v4) — Layer 2 (Photo Signed URL).
// photo path 별 signed URL. Supabase signed URL 만료 (10분) 와 cacheLife stale 정합.
// cacheLife stale: 540 (== 9분) — URL 이 expire 되기 전 fresh fetch 강제 (1분 buffer).
// RLS 가 멤버 통과 필요 — 'use cache: private' (cookies). 동일 path 라도 viewer 별 cache.
async function fetchSigned(photoPath: string, viewerId: string): Promise<string | null> {
  "use cache: private";
  cacheTag(`user-${viewerId}-photo-${photoPath}`, `photo-${photoPath}`);
  cacheLife({
    stale: SIGNED_TTL_SECONDS - 60,
    revalidate: SIGNED_TTL_SECONDS - 120,
    expire: SIGNED_TTL_SECONDS,
  });

  if (!looksLikePhotoPath(photoPath)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(photoPath, SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function getActionLogPhotoSignedUrl(
  photoPath: string | null,
  viewerId: string,
): Promise<string | null> {
  if (!photoPath) return null;
  return fetchSigned(photoPath, viewerId);
}

import { cacheLife, cacheTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getVisibilityVersion } from "@/lib/db/reads/visibility-version";

// Phase 4 (SNS cache plan v4) — Layer 1 (Visibility Decision).
// viewer-keyed list of action_log IDs for a challenge, ordered desc by created_at.
// tag segment 에 visibility_version 을 inject — challenge_participants INSERT/DELETE
// trigger 가 version 증분 → 다음 fetch 가 새 tag 생성 → 자동 invalidation.
//
// inner: 'use cache: private' + cacheTag — viewer cookies 의존 가능.
// outer: visibility_version 을 inject 한 뒤 inner 호출.

// Layer 1 쿼리 본체 — RLS user client 로만 호출한다(인가 경계, admin 대체 금지 — ADR-0036 §2).
// Bearer 경로(BFF /api/feed)는 cookie 도, `use cache: private` 도 쓸 수 없어
// (Route Handler 에서 private cache 불가 — next docs use-cache-private) 이 함수를 직접 쓴다.
export async function readVisibleActionLogIds(
  supabase: SupabaseClient,
  challengeId: string,
): Promise<ReadonlyArray<string>> {
  const { data, error } = await supabase
    .from("action_logs")
    .select("id, created_at")
    .eq("challenge_id", challengeId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data.map((row) => row.id as string);
}

async function fetchListInner(
  challengeId: string,
  viewerId: string,
  visibilityVersion: number,
): Promise<ReadonlyArray<string>> {
  "use cache: private";
  cacheTag(`user-${viewerId}-feed-${challengeId}-v${visibilityVersion}`);
  cacheLife("minutes");

  const supabase = await createClient();
  return readVisibleActionLogIds(supabase, challengeId);
}

export async function listVisibleActionLogIds(
  challengeId: string,
  viewerId: string,
): Promise<ReadonlyArray<string>> {
  const visibilityVersion = await getVisibilityVersion(challengeId);
  return fetchListInner(challengeId, viewerId, visibilityVersion);
}

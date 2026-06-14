import { cacheLife, cacheTag } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";

// 🟨 익명 피어 반려 카운트(ADR-0038 §2). kudos-counts 동형. voter_id 를 select 하지 않는 것이
// 익명성의 실질 메커니즘이다 — head count 만 조회해 누가 눌렀는지 어떤 read 도 반환하지 않는다.
//
// tag: peer-reject-count-${actionLogId} (viewer-agnostic). togglePeerRejection 이 본인 토글 시
// revalidateTag 로 무효화. actionLogId 인자별 cache.
//
// admin + public 'use cache': counts 는 viewer-agnostic 값이고, RLS(peer_rejections_select_self)
// 우회는 Layer 1(listVisibleActionLogIds)이 비멤버 actionLog 를 거른 뒤 challenge-feed.ts 에서만
// 호출되는 contract 로 안전(kudos-counts 와 동일 경계, ADR-0024).
export async function getPeerRejectCountForLog(actionLogId: string): Promise<number> {
  "use cache";
  cacheTag(`peer-reject-count-${actionLogId}`);
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });

  const supabase = adminClient();
  const { count } = await supabase
    .from("peer_rejections")
    .select("id", { count: "exact", head: true })
    .eq("action_log_id", actionLogId);

  return count ?? 0;
}

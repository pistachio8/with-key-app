import { cacheLife, cacheTag } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";

// 🟨 viewer 본인이 이 인증을 반려했는지 여부(ADR-0038). kudos-viewer 동형 — 토글 UI 표시용.
// 익명성: 본인 행 존재 여부만 반환한다(타인의 반려는 카운트로만, peer-rejection-counts).
//
// admin + public 'use cache' 이지만 viewer-specific 값이다. viewerId 는 세 곳 모두에 남는다:
// (a) cached function argument — cache partition(viewerId 가 key 에 포함돼야 viewer 별 entry 분리),
// (b) cacheTag — invalidation, (c) .eq('voter_id', viewerId) SQL filter — admin 이 RLS 를 우회하므로
// leak 의 유일한 방어선. 셋 중 하나라도 빠지면 회귀(ADR-0024).
export async function getViewerPeerRejectionForLog(
  actionLogId: string,
  viewerId: string,
): Promise<boolean> {
  "use cache";
  cacheTag(`user-${viewerId}-peer-reject-${actionLogId}`);
  cacheLife("minutes");

  const supabase = adminClient();
  const { count } = await supabase
    .from("peer_rejections")
    .select("id", { count: "exact", head: true })
    .eq("action_log_id", actionLogId)
    .eq("voter_id", viewerId);

  return (count ?? 0) > 0;
}

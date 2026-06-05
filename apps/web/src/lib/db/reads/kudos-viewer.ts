import { cacheLife, cacheTag } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";
import { KUDOS_EMOJIS, type KudosEmoji } from "@/lib/validators/kudos";

// Phase 3 (SNS cache plan v4) — viewer-specific kudos state. ADR-0024.
// tag: user-${viewerId}-kudos-${actionLogId}. toggleKudos 가 본인 mutate 시
// updateTag 로 즉시 invalidate — read-your-writes 보장.
//
// admin + public 'use cache' 이지만 viewer-specific 값이다. viewerId 는 세 곳 모두에
// 남는다: (a) cached function argument — cache partition 의 주 장치(viewerId 가 cache key 에
// 포함돼야 viewer 별로 entry 가 갈린다), (b) cacheTag — invalidation, (c) .eq('user_id', viewerId)
// SQL filter — admin 이 RLS 를 우회하므로 leak 의 유일한 방어선. 셋 중 하나라도 빠지면 회귀. (ADR-0024)
export async function getViewerKudosForLog(
  actionLogId: string,
  viewerId: string,
): Promise<ReadonlyArray<KudosEmoji>> {
  "use cache";
  cacheTag(`user-${viewerId}-kudos-${actionLogId}`);
  cacheLife("minutes");

  const supabase = adminClient();
  const { data } = await supabase
    .from("kudos")
    .select("emoji")
    .eq("action_log_id", actionLogId)
    .eq("user_id", viewerId);

  const emojis: KudosEmoji[] = [];
  for (const row of data ?? []) {
    if (KUDOS_EMOJIS.includes(row.emoji as KudosEmoji)) {
      emojis.push(row.emoji as KudosEmoji);
    }
  }
  return emojis;
}

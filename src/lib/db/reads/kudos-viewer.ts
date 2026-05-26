import { createClient } from "@/lib/supabase/server";
import { viewerCached } from "@/lib/cache/private";
import { KUDOS_EMOJIS, type KudosEmoji } from "@/lib/validators/kudos";

// Phase 3 (SNS cache plan v4) — viewer-specific kudos state.
// tag: user-${viewerId}-kudos-${actionLogId}. toggleKudos 가 본인 mutate 시
// updateTag 로 즉시 invalidate — read-your-writes 보장.
//
// viewerCached wrapper 가 'use cache: private' + cacheTag + cacheLife 를 한 곳에서 강제.
async function fetchViewerKudosForLog(
  actionLogId: string,
  viewerId: string,
): Promise<ReadonlyArray<KudosEmoji>> {
  const supabase = await createClient();
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

export const getViewerKudosForLog = viewerCached(fetchViewerKudosForLog, {
  tag: (actionLogId, viewerId) => `user-${viewerId}-kudos-${actionLogId}`,
  life: "minutes",
});

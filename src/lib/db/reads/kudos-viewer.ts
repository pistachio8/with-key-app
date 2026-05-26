import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { KUDOS_EMOJIS, type KudosEmoji } from "@/lib/validators/kudos";

// Phase 3 (SNS cache plan v4) — viewer-specific kudos state.
// tag: user-${viewerId}-kudos-${actionLogId}. toggleKudos 가 본인 mutate 시
// updateTag 로 즉시 invalidate — read-your-writes 보장.
//
// 'use cache: private' 함수 본문은 outer-scope 함수/객체를 클로저로 캡처할 수
// 없다 (Next.js 16 직렬화 규칙 — Functions are unsupported). 그래서 wrapper 를
// 거치지 않고 각 read 마다 directive 를 직접 선언한다.
export async function getViewerKudosForLog(
  actionLogId: string,
  viewerId: string,
): Promise<ReadonlyArray<KudosEmoji>> {
  "use cache: private";
  cacheTag(`user-${viewerId}-kudos-${actionLogId}`);
  cacheLife("minutes");

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

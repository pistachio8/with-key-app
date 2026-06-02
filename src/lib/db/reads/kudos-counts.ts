import { cacheLife, cacheTag } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";
import { KUDOS_EMOJIS, type KudosEmoji } from "@/lib/validators/kudos";

// Phase 3 (SNS cache plan v4) — kudos counts. ADR-0024.
// tag: kudos-counts-${actionLogId} (viewer-agnostic). toggleKudos 가 본인 토글 시 updateTag
// (즉시 본인 fresh) + revalidateTag('max') (타인 SWR). actionLogId 인자별 cache.
//
// admin + public 'use cache': counts 는 viewer-agnostic 값이고, kudos RLS
// (`kudos_select_member`) 우회는 Layer 1(listVisibleActionLogIds)이 비멤버 actionLog ID 를
// 거른 뒤 challenge-feed.ts 에서만 호출되는 contract 로 안전. cookies 의존 제거로
// token endpoint 폭발(429)을 끊고, 이전 private cache 의 viewer 별 중복 캐시도 해소된다.
export async function getKudosCountsForLog(
  actionLogId: string,
): Promise<Readonly<Record<KudosEmoji, number>>> {
  "use cache";
  cacheTag(`kudos-counts-${actionLogId}`);
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });

  const supabase = adminClient();
  const { data } = await supabase.from("kudos").select("emoji").eq("action_log_id", actionLogId);

  const counts = Object.fromEntries(KUDOS_EMOJIS.map((e) => [e, 0])) as Record<KudosEmoji, number>;
  for (const row of data ?? []) {
    if (KUDOS_EMOJIS.includes(row.emoji as KudosEmoji)) {
      counts[row.emoji as KudosEmoji] += 1;
    }
  }
  return counts;
}

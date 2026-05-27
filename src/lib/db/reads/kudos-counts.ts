import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { KUDOS_EMOJIS, type KudosEmoji } from "@/lib/validators/kudos";

// Phase 3 (SNS cache plan v4) — kudos counts.
// tag: kudos-counts-${actionLogId}. toggleKudos 가 본인 토글 시 updateTag (즉시 본인 fresh)
// + revalidateTag('max') (타인 SWR). actionLogId 인자별 cache.
//
// 'use cache: private' 사용 이유: counts 자체는 viewer-agnostic 이지만 kudos RLS
// (`kudos_select_member`) 가 `is_group_member` 를 요구해 비멤버는 select 불가.
// 즉 `createClient()` → `cookies()` 가 필수인데, `'use cache'` (public) 는 cookies()
// 호출을 금지(cacheComponents 가드 throw). 따라서 private cache 로 두고 tag 만
// viewer-agnostic (`kudos-counts-${alid}`) 으로 유지 — revalidateTag('max') 는 모든
// viewer 의 해당 actionLog cache 를 일괄 SWR 갱신.
// 비용: emoji count 페이로드가 viewer 별로 중복 캐시되지만 payload 가 작아 acceptable.
export async function getKudosCountsForLog(
  actionLogId: string,
): Promise<Readonly<Record<KudosEmoji, number>>> {
  "use cache: private";
  cacheTag(`kudos-counts-${actionLogId}`);
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });

  const supabase = await createClient();
  const { data } = await supabase.from("kudos").select("emoji").eq("action_log_id", actionLogId);

  const counts = Object.fromEntries(KUDOS_EMOJIS.map((e) => [e, 0])) as Record<KudosEmoji, number>;
  for (const row of data ?? []) {
    if (KUDOS_EMOJIS.includes(row.emoji as KudosEmoji)) {
      counts[row.emoji as KudosEmoji] += 1;
    }
  }
  return counts;
}

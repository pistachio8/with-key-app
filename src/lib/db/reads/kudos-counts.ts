import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { KUDOS_EMOJIS, type KudosEmoji } from "@/lib/validators/kudos";

// Phase 3 (SNS cache plan v4) — viewer-agnostic kudos counts.
// tag: kudos-counts-${actionLogId}. toggleKudos 가 본인 토글 시 updateTag (즉시 본인 fresh)
// + revalidateTag('max') (타인 SWR). actionLogId 인자별 cache.
//
// 'use cache' 가 함수 body 의 'use server'/'use client' 같은 directive 라
// async function 내부에서 사용해야 한다 (Next.js 16 docs).
export async function getKudosCountsForLog(
  actionLogId: string,
): Promise<Readonly<Record<KudosEmoji, number>>> {
  "use cache";
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

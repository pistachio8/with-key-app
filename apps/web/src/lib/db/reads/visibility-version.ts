import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Phase 2 (SNS cache plan v4) — challenges.visibility_version 단순 read.
// 본 read 는 캐시 키 segment 로 사용 (user-${uid}-feed-${cid}-v${version}).
// trigger 가 challenge_participants INSERT/DELETE 시 자동 증분 — invalidation
// 트리거는 DB-level. React.cache 로 request scope dedup.
// 결과 값을 호출자가 cacheTag 인자로 inject 하므로 본 함수 자체는 use cache 미사용.
export const getVisibilityVersion = cache(async (challengeId: string): Promise<number> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("challenges")
    .select("visibility_version")
    .eq("id", challengeId)
    .maybeSingle();
  if (error || !data) {
    // 챌린지 부재 또는 RLS 차단 — 캐시 키로 사용될 때 0 으로 fallback.
    // 사용처는 visibility 결정 자체가 의미 없는 상태이므로 추가 가드를 함께 둔다.
    return 0;
  }
  return data.visibility_version;
});

// src/lib/db/reads/challenge-montage.ts
import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { MONTAGE_BUCKET, montageOutputPath } from "@/lib/media/montage/types";

const SIGNED_TTL_SECONDS = 600; // 10분 — video-signed-url.ts 와 동일(Storage createSignedUrl ttl 정합).

// 합본 몽타주 결과 signed URL(spec §C6-B / EVAL-0046 · ADR-0040).
// 결과 mp4 가 준비됐으면 URL, 아직이거나 비멤버면 null → recap 은 StoryPlayback 으로 fallback.
//
// 접근 제어: challenge-videos.ts 와 동일하게 viewer RLS user client(createClient)로 읽는다.
// migration 0057 cm_select_group_member 가 비그룹멤버의 signed URL 발급을 거른다.
// (adminClient + ADR-0024 admin hydrate 경로가 아님 — recap 은 challenge-feed.ts callsite 가 아니므로.)
export const fetchChallengeMontageUrl = cache(
  async (
    challengeId: string,
    options: { client?: SupabaseClient } = {},
  ): Promise<string | null> => {
    const supabase = options.client ?? (await createClient());
    const { data, error } = await supabase.storage
      .from(MONTAGE_BUCKET)
      .createSignedUrl(montageOutputPath(challengeId), SIGNED_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  },
);

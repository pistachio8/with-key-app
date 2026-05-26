import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getPhotoSignedUrls } from "@/lib/storage/action-photos";
import { getKudosCountsForLog } from "@/lib/db/reads/kudos-counts";
import { getViewerKudosForLog } from "@/lib/db/reads/kudos-viewer";
import { KUDOS_EMOJIS, type KudosEmoji } from "@/lib/validators/kudos";

export type FeedItemView = {
  id: string;
  authorId: string;
  authorName: string;
  photoSignedUrl: string | null;
  summary: string;
  keywords: ReadonlyArray<string>;
  kudosByEmoji: Readonly<Record<KudosEmoji, number>>;
  viewerKudos: ReadonlyArray<KudosEmoji>;
  createdAt: string;
};

type Options = {
  client?: SupabaseClient;
};

type FeedRow = {
  id: string;
  user_id: string;
  photo_path: string | null;
  ai_summary: string;
  selected_keywords: string[] | null;
  created_at: string;
  users: { display_name: string | null } | Array<{ display_name: string | null }> | null;
};

function emptyKudosByEmoji(): Record<KudosEmoji, number> {
  return Object.fromEntries(KUDOS_EMOJIS.map((emoji) => [emoji, 0])) as Record<KudosEmoji, number>;
}

// PRD §7 · BE_SCHEMA §5.7 — 챌린지 피드.
// Phase 3 (SNS cache plan v4): kudos embed 제거. kudos counts/viewer 는 별도 read
// 함수 (kudos-counts · kudos-viewer) 가 actionLogId 단위 cacheTag 로 분리 관리.
// fetchChallengeFeed 자체는 RSC parallel fetch entry — kudos cache 미스/히트 와 별개로
// metadata 는 항상 fresh 한다.
// RLS가 action_logs/users 접근을 필터링하므로 비멤버는 빈 배열을 받는다.
export const fetchChallengeFeed = cache(
  async (challengeId: string, viewerId: string, options: Options = {}): Promise<FeedItemView[]> => {
    const supabase = options.client ?? (await createClient());

    const { data, error } = await supabase
      .from("action_logs")
      .select(
        [
          "id",
          "user_id",
          "photo_path",
          "ai_summary",
          "selected_keywords",
          "created_at",
          // ADR-0017 kudos_push_log 가 action_logs ↔ users 사이 M2M 관계를 추가해
          // PostgREST 가 embed 모호함(PGRST201)을 보고한다. 원래 의도한 작성자 FK 를 명시.
          "users!action_logs_user_id_fkey!inner(display_name)",
        ].join(","),
      )
      .eq("challenge_id", challengeId)
      .order("created_at", { ascending: false });

    if (error || !data) return [];

    const rows = data as unknown as FeedRow[];
    // Single Storage batch request instead of N parallel createSignedUrl calls.
    const signedUrls = await getPhotoSignedUrls(
      rows.map((row) => row.photo_path),
      supabase,
    );

    // Kudos counts (viewer-agnostic, 'use cache' + tag kudos-counts-${alid}) 와
    // viewer kudos (viewer-keyed, 'use cache: private' + tag user-${uid}-kudos-${alid})
    // 를 각 row 별로 병렬 fetch. cache hit 시 즉시 반환.
    const kudosByLog = await Promise.all(
      rows.map(async (row) => {
        const [counts, viewerKudos] = await Promise.all([
          getKudosCountsForLog(row.id),
          getViewerKudosForLog(row.id, viewerId),
        ]);
        return { id: row.id, counts, viewerKudos };
      }),
    );
    const kudosMap = new Map(kudosByLog.map((k) => [k.id, k]));

    return rows.map((row, index) => {
      const author = Array.isArray(row.users) ? row.users[0] : row.users;
      const kudos = kudosMap.get(row.id);

      return {
        id: row.id,
        authorId: row.user_id,
        authorName: author?.display_name ?? "익명",
        photoSignedUrl: signedUrls[index],
        summary: row.ai_summary,
        keywords: row.selected_keywords ?? [],
        kudosByEmoji: kudos?.counts ?? emptyKudosByEmoji(),
        viewerKudos: kudos?.viewerKudos ?? [],
        createdAt: row.created_at,
      };
    });
  },
);

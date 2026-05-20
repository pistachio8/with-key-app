import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getPhotoSignedUrls } from "@/lib/storage/action-photos";
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
  kudos: Array<{ user_id: string; emoji: string }> | null;
};

function emptyKudosByEmoji(): Record<KudosEmoji, number> {
  return Object.fromEntries(KUDOS_EMOJIS.map((emoji) => [emoji, 0])) as Record<KudosEmoji, number>;
}

function isKudosEmoji(value: string): value is KudosEmoji {
  return KUDOS_EMOJIS.includes(value as KudosEmoji);
}

// PRD §7 · BE_SCHEMA §5.7 — 챌린지 피드.
// RLS가 action_logs/kudos/users 접근을 필터링하므로 비멤버는 빈 배열을 받는다.
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
          "users!inner(display_name)",
          "kudos(user_id, emoji)",
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

    return rows.map((row, index) => {
      const author = Array.isArray(row.users) ? row.users[0] : row.users;
      const kudosByEmoji = emptyKudosByEmoji();
      const viewerKudos: KudosEmoji[] = [];

      for (const kudos of row.kudos ?? []) {
        if (!isKudosEmoji(kudos.emoji)) continue;
        kudosByEmoji[kudos.emoji] += 1;
        if (kudos.user_id === viewerId) viewerKudos.push(kudos.emoji);
      }

      return {
        id: row.id,
        authorId: row.user_id,
        authorName: author?.display_name ?? "익명",
        photoSignedUrl: signedUrls[index],
        summary: row.ai_summary,
        keywords: row.selected_keywords ?? [],
        kudosByEmoji,
        viewerKudos,
        createdAt: row.created_at,
      };
    });
  },
);

// src/lib/db/reads/challenge-videos.ts
import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getVideoSignedUrls } from "@/lib/storage/action-videos";
import type { RecapVideoView } from "@withkey/domain";

// 영상 스토리 결과물(spec §C6-A / EVAL-0043). challenge-photos.ts 패턴 미러 —
// media_type='video' + video_path IS NOT NULL 인 인증을 시간순으로 모아 클립 스토리로 재생.
//
// 접근 제어: adminClient(ADR-0024 admin hydrate)가 아니라 viewer RLS user client(createClient)로
// 읽는다 — Storage av_select_group_member 가 비멤버를 거른다. ADR-0024 의 "admin hydrate read 는
// challenge-feed.ts callsite 제한" 제약은 admin 경로 전용이라 본 RLS-gated read 에는 해당하지 않는다.
export type { RecapVideoView };

type VideoRow = {
  id: string;
  user_id: string;
  video_path: string | null;
  created_at: string;
  users: { display_name: string | null } | Array<{ display_name: string | null }>;
};

/** Pure mapper — DB 비의존. 단위 테스트 대상(challenge-photos 와 동형). */
export function buildChallengeVideosView(
  rows: ReadonlyArray<VideoRow>,
  signedUrls: ReadonlyArray<string | null>,
): ReadonlyArray<RecapVideoView> {
  const out: RecapVideoView[] = [];
  rows.forEach((row, i) => {
    if (!row.video_path) return;
    const url = signedUrls[i];
    if (!url) return;
    const author = Array.isArray(row.users) ? row.users[0] : row.users;
    out.push({
      id: row.id,
      signedUrl: url,
      takenAt: row.created_at,
      ownerDisplayName: author?.display_name ?? "익명",
      ownerId: row.user_id,
    });
  });
  return out;
}

/** RLS가 그룹 멤버만 허용 → 비멤버는 빈 배열을 받음. peer_rejected 클립은 스토리에서 제외. */
export const fetchChallengeVideos = cache(
  async (
    challengeId: string,
    options: { client?: SupabaseClient } = {},
  ): Promise<ReadonlyArray<RecapVideoView>> => {
    const supabase = options.client ?? (await createClient());
    const { data, error } = await supabase
      .from("action_logs")
      .select(
        // ADR-0017 FK 모호함 회피 — 작성자 FK 명시(challenge-photos.ts 와 동일).
        [
          "id",
          "user_id",
          "video_path",
          "created_at",
          "users!action_logs_user_id_fkey!inner(display_name)",
        ].join(","),
      )
      .eq("challenge_id", challengeId)
      .eq("media_type", "video")
      .not("video_path", "is", null)
      .neq("auto_verify_status", "peer_rejected")
      .order("created_at", { ascending: true });

    if (error || !data) return [];

    const rows = data as unknown as VideoRow[];
    const signedUrls = await getVideoSignedUrls(
      rows.map((r) => r.video_path),
      supabase,
    );
    return buildChallengeVideosView(rows, signedUrls);
  },
);

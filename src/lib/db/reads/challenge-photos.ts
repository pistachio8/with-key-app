// src/lib/db/reads/challenge-photos.ts
import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getPhotoSignedUrls } from "@/lib/storage/action-photos";

export type RecapPhotoView = {
  id: string;
  signedUrl: string;
  takenAt: string;
  ownerDisplayName: string;
};

type PhotoRow = {
  id: string;
  photo_path: string | null;
  created_at: string;
  users: { display_name: string | null } | Array<{ display_name: string | null }>;
};

/** Pure mapper — DB 비의존. 단위 테스트 대상. */
export function buildChallengePhotosView(
  rows: ReadonlyArray<PhotoRow>,
  signedUrls: ReadonlyArray<string | null>,
): ReadonlyArray<RecapPhotoView> {
  const out: RecapPhotoView[] = [];
  rows.forEach((row, i) => {
    if (!row.photo_path) return;
    const url = signedUrls[i];
    if (!url) return;
    const author = Array.isArray(row.users) ? row.users[0] : row.users;
    out.push({
      id: row.id,
      signedUrl: url,
      takenAt: row.created_at,
      ownerDisplayName: author?.display_name ?? "익명",
    });
  });
  return out;
}

/** RLS가 그룹 멤버만 허용 → 비멤버는 빈 배열을 받음. */
export const fetchChallengePhotos = cache(
  async (
    challengeId: string,
    options: { client?: SupabaseClient } = {},
  ): Promise<ReadonlyArray<RecapPhotoView>> => {
    const supabase = options.client ?? (await createClient());
    const { data, error } = await supabase
      .from("action_logs")
      .select(["id", "photo_path", "created_at", "users!inner(display_name)"].join(","))
      .eq("challenge_id", challengeId)
      .not("photo_path", "is", null)
      .order("created_at", { ascending: true });

    if (error || !data) return [];

    const rows = data as unknown as PhotoRow[];
    const signedUrls = await getPhotoSignedUrls(
      rows.map((r) => r.photo_path),
      supabase,
    );
    return buildChallengePhotosView(rows, signedUrls);
  },
);

import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionLogHydrate = {
  id: string;
  authorId: string;
  authorName: string;
  photoPath: string | null;
  summary: string;
  keywords: ReadonlyArray<string>;
  createdAt: string;
};

// Phase 4 (SNS cache plan v4) — Layer 2 (Content Hydration).
// actionlog-keyed hydration: 본문 텍스트 · photo_path · AI summary · 키워드 · 작성자.
// 본문은 viewer-agnostic 이지만 RLS 가 멤버만 통과 — 'use cache: private' 으로
// viewer-keyed cache (cookies 의존). 편집/삭제 시 모든 viewer 의 cache 를
// 무효화하기 위해 actionlog-${id} tag 도 함께 부여.
async function fetchHydrate(
  actionLogId: string,
  viewerId: string,
): Promise<ActionLogHydrate | null> {
  "use cache: private";
  cacheTag(`user-${viewerId}-actionlog-${actionLogId}`, `actionlog-${actionLogId}`);
  cacheLife("hours");

  const supabase = await createClient();
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
        // ADR-0017 의 fk 모호함 회피.
        "users!action_logs_user_id_fkey!inner(display_name)",
      ].join(","),
    )
    .eq("id", actionLogId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as {
    id: string;
    user_id: string;
    photo_path: string | null;
    ai_summary: string;
    selected_keywords: string[] | null;
    created_at: string;
    users: { display_name: string | null } | Array<{ display_name: string | null }> | null;
  };
  const author = Array.isArray(row.users) ? row.users[0] : row.users;

  return {
    id: row.id,
    authorId: row.user_id,
    authorName: author?.display_name ?? "익명",
    photoPath: row.photo_path,
    summary: row.ai_summary,
    keywords: row.selected_keywords ?? [],
    createdAt: row.created_at,
  };
}

export async function getActionLogHydrate(
  actionLogId: string,
  viewerId: string,
): Promise<ActionLogHydrate | null> {
  return fetchHydrate(actionLogId, viewerId);
}

import { cacheLife, cacheTag } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";

export type ActionLogHydrate = {
  id: string;
  authorId: string;
  authorName: string;
  photoPath: string | null;
  summary: string;
  keywords: ReadonlyArray<string>;
  createdAt: string;
};

// Phase 4 (SNS cache plan v4) — Layer 2 (Content Hydration). ADR-0024.
// actionlog-keyed hydration: 본문 텍스트 · photo_path · AI summary · 키워드 · 작성자.
//
// admin + public 'use cache': 본문은 viewer-agnostic 이라 cached inner 는 actionLogId 만
// 받아 모든 viewer 가 같은 cache entry 를 공유한다 (viewerId 가 cache key 에 들어가면
// cross-viewer 공유가 깨진다 — ADR-0024). cookies 의존 제거로 token endpoint 폭발(429) 차단.
// 접근 제어는 Layer 1(listVisibleActionLogIds)이 비멤버 ID 를 거른 뒤 challenge-feed.ts
// 에서만 호출되는 contract 로 보장. 편집/삭제 mutation 추가 시 actionlog-${id} tag invalidate.
async function fetchHydrate(actionLogId: string): Promise<ActionLogHydrate | null> {
  "use cache";
  cacheTag(`actionlog-${actionLogId}`);
  cacheLife("hours");

  const supabase = adminClient();
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

// _viewerId 는 호출처 호환을 위해 유지하되 cached inner 로 전달하지 않는다 (ADR-0024).
export async function getActionLogHydrate(
  actionLogId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _viewerId: string,
): Promise<ActionLogHydrate | null> {
  return fetchHydrate(actionLogId);
}

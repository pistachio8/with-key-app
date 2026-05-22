import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// NOTE: 현재 호출자 없음. /feed 폐기(ADR-0002) 이후 헤더 dot 소스가
// IDB unread (plan 2026-05-22-header-unread-dot-source) 로 이전됨.
// 완전 제거는 follow-up — `last_feed_seen_at` column drop migration + ADR 동반.

// DESIGN_BRIEF §1.5 — 피드 미읽음 Kudos 배지 last-seen 판정.
export function isUnread(input: { createdAt: string; lastSeenAt: string | null }): boolean {
  if (input.lastSeenAt === null) return true;
  return new Date(input.createdAt).getTime() > new Date(input.lastSeenAt).getTime();
}

type Options = { client?: SupabaseClient };

/**
 * viewer 의 action_logs 에 달린 kudos 중 last_feed_seen_at 이후 발생한 개수.
 * RLS 가 피드 멤버십을 강제(kudos_select_member). self-kudos 는 kudos_insert_self_not_own 이 이미 차단.
 */
export async function fetchUnreadKudosCount(
  viewerId: string,
  options: Options = {},
): Promise<number> {
  const supabase = options.client ?? (await createClient());

  const { data: me } = await supabase
    .from("users")
    .select("last_feed_seen_at")
    .eq("id", viewerId)
    .maybeSingle();

  const lastSeen = (me?.last_feed_seen_at as string | null) ?? null;

  // head:true + count:'exact' → row 본문 전송 없이 count 만.
  let query = supabase
    .from("kudos")
    .select("action_log_id, action_logs!inner(user_id)", { count: "exact", head: true })
    .eq("action_logs.user_id", viewerId);

  if (lastSeen) query = query.gt("created_at", lastSeen);

  const { count, error } = await query;
  if (error || count === null) return 0;
  return count;
}

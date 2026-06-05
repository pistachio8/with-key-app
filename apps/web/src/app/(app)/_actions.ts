"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";

// NOTE: 현재 호출자 없음 (spec 외). 헤더 dot 소스가 IDB unread 로 이전됨
// (plan 2026-05-22-header-unread-dot-source). 완전 제거는 follow-up.
//
// 헤더 알림 dot 클리어 — `/notifications` 페이지(PR7) 또는 알림 진입점이 호출.
// /feed 라우트 폐기(ADR-0002) 후에도 동일 의미. last_feed_seen_at 컬럼명은 보존.
export const markFeedSeen = withUser<void, null>(async (user): Promise<ActionResult<null>> => {
  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({ last_feed_seen_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return failure(mapSupabaseError(error));

  revalidatePath("/home");
  return success(null);
});

"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";

// DESIGN_BRIEF §1.5 — Kudos 배지 clear. 피드 진입 시 Server Component 가 호출.
export const markFeedSeen = withUser<void, null>(
  async (user): Promise<ActionResult<null>> => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("users")
      .update({ last_feed_seen_at: new Date().toISOString() })
      .eq("id", user.id);
    if (error) return failure(mapSupabaseError(error));

    revalidatePath("/feed");
    revalidatePath("/home");
    return success(null);
  },
);

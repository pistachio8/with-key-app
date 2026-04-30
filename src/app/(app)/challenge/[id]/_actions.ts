"use server";

import { kudosInputSchema, type KudosInput } from "@/lib/validators/kudos";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";

type KudosResult = { toggled: "added" | "removed" };

// BE_SCHEMA §8.6. UNIQUE (action_log_id, user_id, emoji) 로 토글.
export const toggleKudos = withUser<KudosInput, KudosResult>(
  async (user, input): Promise<ActionResult<KudosResult>> => {
    const parsed = kudosInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("kudos")
      .select("id")
      .eq("action_log_id", parsed.data.actionLogId)
      .eq("user_id", user.id)
      .eq("emoji", parsed.data.emoji)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase.from("kudos").delete().eq("id", existing.id);
      if (error) return failure(mapSupabaseError(error));
      return success({ toggled: "removed" });
    }

    const { error } = await supabase.from("kudos").insert({
      action_log_id: parsed.data.actionLogId,
      user_id: user.id,
      emoji: parsed.data.emoji,
    });
    if (error) return failure(mapSupabaseError(error));

    void track(
      {
        name: "kudos_given",
        props: { actionLogId: parsed.data.actionLogId, emoji: parsed.data.emoji },
      },
      { userId: user.id },
    );

    return success({ toggled: "added" });
  },
);

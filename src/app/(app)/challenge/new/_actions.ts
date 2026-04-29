"use server";

import { challengeInputSchema, type ChallengeInput } from "@/lib/validators/challenge";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";

type CreateInput = ChallengeInput & { groupId: string };

// BE_SCHEMA §8.1. RLS 가 owner 검증 수행.
export const createChallenge = withUser<CreateInput, { id: string }>(
  async (_user, input): Promise<ActionResult<{ id: string }>> => {
    const { groupId, ...rest } = input;
    const parsed = challengeInputSchema.safeParse(rest);
    if (!parsed.success) return validationFailure(parsed.error);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("challenges")
      .insert({
        group_id: groupId,
        title: parsed.data.title,
        type: parsed.data.type,
        goal_count: parsed.data.goalCount,
        duration_days: parsed.data.durationDays,
        penalty_amount: parsed.data.penaltyAmount,
      })
      .select("id")
      .single();

    if (error) return failure(mapSupabaseError(error));
    if (!data) return failure("upstream_error");

    await track({
      name: "challenge_created",
      props: {
        challengeId: data.id,
        penaltyAmount: parsed.data.penaltyAmount,
        goalCount: parsed.data.goalCount,
      },
    }).catch((err) => console.error("[createChallenge] track failed:", err));

    return success({ id: data.id });
  },
);

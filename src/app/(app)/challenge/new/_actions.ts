"use server";

import { challengeInputSchema, type ChallengeInput } from "@/lib/validators/challenge";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";

type CreateInput = ChallengeInput & { groupId: string };

// BE_SCHEMA §8.1. SECURITY DEFINER RPC `create_challenge` 가 challenges +
// challenge_participants(전 group_members 시드) 를 한 트랜잭션으로 처리.
// migration: 0021_create_challenge_rpc.sql
export const createChallenge = withUser<CreateInput, { id: string }>(
  async (user, input): Promise<ActionResult<{ id: string }>> => {
    const { groupId, ...rest } = input;
    const parsed = challengeInputSchema.safeParse(rest);
    if (!parsed.success) return validationFailure(parsed.error);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_challenge", {
      p_group_id: groupId,
      p_title: parsed.data.title,
      p_type: parsed.data.type,
      p_goal_count: parsed.data.goalCount,
      p_duration_days: parsed.data.durationDays,
      p_penalty_amount: parsed.data.penaltyAmount,
    });

    if (error) {
      if (error.code === "P0002") return failure("not_found");
      return failure(mapSupabaseError(error));
    }
    const row = data?.[0];
    if (!row) return failure("upstream_error");

    void track(
      {
        name: "challenge_created",
        props: {
          challengeId: row.id,
          penaltyAmount: parsed.data.penaltyAmount,
          goalCount: parsed.data.goalCount,
          // 코호트 분리(솔로 1 / 그룹 ≥2). PR-1 RPC 반환값.
          participantCount: row.participant_count,
        },
      },
      { userId: user.id },
    );

    return success({ id: row.id });
  },
);

"use server";

import { challengeInputSchema, type ChallengeInput } from "@/lib/validators/challenge";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, validationFailure, type ActionResult } from "@/lib/actions/response";

// BE_SCHEMA §8.1 · DB 연결은 0001_init.sql 확정 후.
// withUser 가 세션 가드. layout guard 와 별개로 Action endpoint 자체에서 재확인(open-endpoint 방어).
export const createChallenge = withUser<ChallengeInput, { id: string }>(
  async (_user, input): Promise<ActionResult<{ id: string }>> => {
    const parsed = challengeInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    // TODO(Day 2): insert into challenges table + derive startAt/endAt from durationDays.
    const challengeId = crypto.randomUUID();
    // Analytics must never block the core flow; isolate its failure from the action result.
    await track({
      name: "challenge_created",
      props: {
        challengeId,
        penaltyAmount: parsed.data.penaltyAmount,
        goalCount: parsed.data.goalCount,
      },
    }).catch((err) => {
      console.error("[createChallenge] track failed:", err);
    });
    return success({ id: challengeId });
  },
);

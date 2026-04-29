"use server";

import { z } from "zod";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, validationFailure, type ActionResult } from "@/lib/actions/response";

// BE_SCHEMA §8.4
const signInputSchema = z.object({ challengeId: z.string().uuid() });
type SignInput = z.infer<typeof signInputSchema>;

// NOTE: 소유 챌린지(내가 참가자인지) 검증은 DB 결합 PR(Day 2) 에서 추가.
export const signPledge = withUser<SignInput, { challengeId: string }>(
  async (user, input): Promise<ActionResult<{ challengeId: string }>> => {
    const parsed = signInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    // TODO(Day 2): UPDATE challenge_participants SET signed_at = now() WHERE
    //   challenge_id = :challengeId AND user_id = :user.id;
    //   -- plus: if every participant signed, set challenges.status = 'active'.
    await track({
      name: "challenge_signed",
      props: { challengeId: parsed.data.challengeId, userId: user.id },
    }).catch((err) => {
      console.error("[signPledge] track failed:", err);
    });
    return success({ challengeId: parsed.data.challengeId });
  },
);

"use server";

import { z } from "zod";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";
import { after } from "next/server";
import { dispatchOwnerStartNudge } from "@/lib/push/dispatch";

const signInputSchema = z.object({ challengeId: z.string().uuid() });
type SignInput = z.infer<typeof signInputSchema>;

type SignResult = {
  challengeId: string;
  status: "pending" | "accepted" | "active" | "closed";
  // PR-2 dual-mode: 활성 시점의 실제 참가자 수. 솔로 의도 → 그룹 합류 race
  // 감지에 사용 (Edge #2 — pledge-sheet 의 의도-결과 불일치 안내).
  participantCount: number;
};

// BE_SCHEMA §8.4. RPC 가 원자적으로 서명만 기록한다. 시작은 오너가
// startChallengeWithSignedParticipants 액션으로 명시 수행한다.
export const signPledge = withUser<SignInput, SignResult>(
  async (user, input): Promise<ActionResult<SignResult>> => {
    const parsed = signInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("sign_and_maybe_activate", {
      p_challenge_id: parsed.data.challengeId,
    });

    if (error) return failure(mapSupabaseError(error));
    const row = data?.[0];
    if (!row) return failure("not_found");

    void track(
      {
        name: "challenge_signed",
        props: { challengeId: parsed.data.challengeId, userId: user.id },
      },
      { userId: user.id },
    );

    // ADR-0028 — 전원 서명 완료 + 마지막 서명자가 멤버면 오너에게 시작 nudge.
    // RPC 가 atomic 하게 1회만 should_nudge_owner=true 로 판정(start_nudge_sent_at).
    if (row.should_nudge_owner && row.owner_user_id) {
      const ownerId = row.owner_user_id as string;
      after(() =>
        dispatchOwnerStartNudge(parsed.data.challengeId, ownerId).catch((e) =>
          console.error("[signPledge] owner start nudge dispatch failed", e),
        ),
      );
    }

    return success({
      challengeId: parsed.data.challengeId,
      status: row.status as SignResult["status"],
      participantCount: row.participant_count ?? 1,
    });
  },
);

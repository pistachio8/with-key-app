"use server";

import { z } from "zod";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";
import { dispatchStartNotification } from "@/lib/push/dispatch";

const signInputSchema = z.object({ challengeId: z.string().uuid() });
type SignInput = z.infer<typeof signInputSchema>;

type SignResult = { challengeId: string; status: "pending" | "accepted" | "active" | "closed" };

// BE_SCHEMA §8.4. RPC 가 원자적 상태 전이.
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

    if (row.status === "active") {
      // PR-2: 활성화 이벤트 발화. signToActiveMs = 챌린지 생성 → active 전이
      // 소요(J-2(a) 결정). participantCount 는 코호트 분리(솔로 1 / 그룹 ≥2).
      // RPC 0022 가 challenge_created_at 과 participant_count 를 반환한다.
      const signToActiveMs = row.challenge_created_at
        ? Math.max(0, Date.now() - new Date(row.challenge_created_at).getTime())
        : 0;
      void track(
        {
          name: "challenge_activated",
          props: {
            challengeId: parsed.data.challengeId,
            signToActiveMs,
            participantCount: row.participant_count ?? 1,
          },
        },
        { userId: user.id },
      );

      // Fire-and-forget. dispatch 실패가 서명 성공을 뒤엎지 않도록
      // 반환 전에 어떤 await 도 걸지 않는다.
      void dispatchStartNotification(parsed.data.challengeId).catch(() => {
        // dispatch 내부에서 track 이 이미 outcome='failed' 를 기록한다.
      });
    }

    return success({
      challengeId: parsed.data.challengeId,
      status: row.status as SignResult["status"],
    });
  },
);

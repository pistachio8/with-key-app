"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { challengeInputSchema } from "@/lib/validators/challenge";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";
import { readOwnerGroupsForChallengeForm } from "@/lib/db/reads/owner-groups-for-challenge-form";
import { defaultGroupBaseName } from "@/lib/groups/default-name";
import { generateInviteToken } from "@/lib/invite/token";
import { buildInviteUrl } from "@/lib/invite/share-url";

// ADR-0012: groupId 없으면 owner 그룹 수로 persistent crew 매칭.
// plan §PR5: createChallenge 가 그룹/챌린지/운영자 자가 서명/invite 토큰 까지 처리.
const createChallengeInputSchema = challengeInputSchema.extend({
  groupId: z.string().uuid().optional(),
  /** 보관 안 함(plan §5.1 Step 7b) — 길이>0 이면 서명 완료로 간주. */
  ownerSignatureDataUrl: z.string().min(1).optional(),
});

export type CreateChallengeInput = z.infer<typeof createChallengeInputSchema>;
export type CreateChallengeResult = { id: string; inviteUrl: string };

export const createChallenge = withUser<CreateChallengeInput, CreateChallengeResult>(
  async (user, input): Promise<ActionResult<CreateChallengeResult>> => {
    const parsed = createChallengeInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const { groupId: maybeGroupId, ownerSignatureDataUrl, ...challengeFields } = parsed.data;

    const supabase = await createClient();

    // 1) 그룹 — 미제공 시 owner 그룹 수로 persistent crew 매칭 (ADR-0012)
    let groupId = maybeGroupId;
    if (!groupId) {
      const ownerGroups = await readOwnerGroupsForChallengeForm(supabase, user.id);
      if (!ownerGroups.ok) return failure("upstream_error");

      if (ownerGroups.groups.length === 1) {
        groupId = ownerGroups.groups[0]!.id;
      } else if (ownerGroups.groups.length >= 2) {
        return failure("invalid_input", { groupId: ["그룹을 선택해 주세요"] });
      } else {
        const { data: me } = await supabase
          .from("users")
          .select("display_name")
          .eq("id", user.id)
          .maybeSingle();
        const displayName = me?.display_name ?? "내";
        const { data: createdGroupId, error: groupErr } = await supabase.rpc(
          "create_group_with_owner",
          {
            p_name: defaultGroupBaseName(displayName),
            p_bank_code: null,
            p_account_holder: null,
            p_account_number_encrypted: null,
            p_account_number_last4: null,
          },
        );
        if (groupErr) return failure(mapSupabaseError(groupErr));
        if (!createdGroupId || typeof createdGroupId !== "string") return failure("upstream_error");
        groupId = createdGroupId;
        void track(
          {
            name: "group_created",
            props: { groupId, memberTarget: 4, hasAccount: false },
          },
          { userId: user.id },
        );
      }
    }
    if (!groupId) return failure("upstream_error");

    // 2) 챌린지 생성 (RPC: challenges + challenge_participants 시드)
    const { data: challengeRows, error: challengeErr } = await supabase.rpc("create_challenge", {
      p_group_id: groupId,
      p_title: challengeFields.title,
      p_type: challengeFields.type,
      p_goal_count: challengeFields.goalCount,
      p_duration_days: challengeFields.durationDays,
      p_penalty_amount: challengeFields.penaltyAmount,
    });
    if (challengeErr) {
      if (challengeErr.code === "P0002") return failure("not_found");
      return failure(mapSupabaseError(challengeErr));
    }
    const challengeRow = challengeRows?.[0];
    if (!challengeRow) return failure("upstream_error");
    const challengeId = challengeRow.id;

    void track(
      {
        name: "challenge_created",
        props: {
          challengeId,
          penaltyAmount: challengeFields.penaltyAmount,
          goalCount: challengeFields.goalCount,
          participantCount: challengeRow.participant_count,
        },
      },
      { userId: user.id },
    );

    // 3) 운영자 자가 서명 — 캔버스 stroke 가 있으면 즉시 서명.
    if (ownerSignatureDataUrl) {
      const { error: signErr } = await supabase.rpc("sign_and_maybe_activate", {
        p_challenge_id: challengeId,
      });
      if (signErr) return failure(mapSupabaseError(signErr));
      void track(
        { name: "challenge_signed", props: { challengeId, userId: user.id } },
        { userId: user.id },
      );
    }

    // 4) Invite 토큰 — 공유 URL.
    const token = generateInviteToken();
    const { error: inviteErr } = await supabase
      .from("invites")
      .insert({ group_id: groupId, token, created_by: user.id });
    if (inviteErr) return failure(mapSupabaseError(inviteErr));
    void track({ name: "invite_sent", props: { groupId } }, { userId: user.id });

    const h = await headers();
    const proto = h.get("x-forwarded-proto") ?? "https";
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    const inviteUrl = buildInviteUrl(`${proto}://${host}`, token);

    return success({ id: challengeId, inviteUrl });
  },
);

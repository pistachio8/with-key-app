"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { withUser } from "@/lib/auth/with-user";
import {
  success,
  failure,
  validationFailure,
  type ActionResult,
  type ErrorCode,
} from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { track } from "@/lib/analytics/track";

const tokenSchema = z.string().min(1);

type PgErrorLike = { code?: string | null; message?: string | null };

function mapAcceptInviteError(err: PgErrorLike): ErrorCode {
  if (err.code === "P0002") return "not_found";
  return mapSupabaseError(err);
}

// PRD §3.3 AC-3 · BE_SCHEMA §8.3.
// RPC accept_invite 가 만료·중복·꽉참을 한 번에 판정. 이 Action 은 매핑만.
export const acceptInvite = withUser<string, { groupId: string }>(
  async (user, token): Promise<ActionResult<{ groupId: string }>> => {
    const parsed = tokenSchema.safeParse(token);
    if (!parsed.success) return validationFailure(parsed.error);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("accept_invite", { p_token: parsed.data });

    if (error) return failure(mapAcceptInviteError(error));
    if (!data || typeof data !== "string") return failure("upstream_error");

    void track(
      { name: "invite_opened", props: { groupId: data, fromOrganicUser: false } },
      { userId: user.id },
    );

    return success({ groupId: data });
  },
);

// src/app/(app)/group/[id]/_actions.ts
"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { track } from "@/lib/analytics/track";
import { generateInviteToken } from "@/lib/invite/token";

const groupIdSchema = z.string().uuid();

// PRD §3.3 AC-2 · BE_SCHEMA §8.2.
// 72h 만료는 invites.expires_at DEFAULT 가 보장 (0001_init.sql:48).
// RLS invites_insert_owner 가 오너 외 호출을 42501 로 거부.
export const createInvite = withUser<string, { token: string }>(
  async (user, groupId): Promise<ActionResult<{ token: string }>> => {
    const parsed = groupIdSchema.safeParse(groupId);
    if (!parsed.success) return validationFailure(parsed.error);

    const token = generateInviteToken();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("invites")
      .insert({
        group_id: parsed.data,
        token,
        created_by: user.id,
      })
      .select("token")
      .single();

    if (error) return failure(mapSupabaseError(error));
    if (!data?.token) return failure("upstream_error");

    void track({ name: "invite_sent", props: { groupId: parsed.data } }, { userId: user.id });

    return success({ token: data.token });
  },
);

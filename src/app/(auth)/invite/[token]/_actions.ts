"use server";

import { updateTag } from "next/cache";
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
import { fetchNotificationPrefs } from "@/lib/db/reads/notification-prefs";

const tokenSchema = z.string().min(1);

type PgErrorLike = { code?: string | null; message?: string | null };

function mapAcceptInviteError(err: PgErrorLike): ErrorCode {
  if (err.code === "P0002") return "not_found";
  return mapSupabaseError(err);
}

// PRD §3.3 AC-3 · BE_SCHEMA §8.3.
// RPC accept_invite 가 만료·중복·꽉참을 한 번에 판정. 이 Action 은 매핑만.
// notifPromptRequired: 신규 가입자 DEFAULT_PREFS=OFF (ADR-0013) 와 정합 — 알림 미옵트인
// 상태로 invite 를 수락하면 그룹원 인증/시작 푸시를 못 받으므로, client 가 toast 로
// /me 토글 ON 을 안내하도록 신호를 보낸다.
type AcceptInviteResult = {
  groupId: string;
  redirectTo: string;
  notifPromptRequired: boolean;
};

export const acceptInvite = withUser<string, AcceptInviteResult>(
  async (user, token): Promise<ActionResult<AcceptInviteResult>> => {
    const parsed = tokenSchema.safeParse(token);
    if (!parsed.success) return validationFailure(parsed.error);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("accept_invite", { p_token: parsed.data });

    if (error) return failure(mapAcceptInviteError(error));
    if (!data || typeof data !== "string") return failure("upstream_error");

    // Phase 5-2: 본인 my-challenges + home-feed read-your-writes.
    updateTag(`user-${user.id}-my-challenges`);
    updateTag(`user-${user.id}-home-feed`);

    void track(
      { name: "invite_opened", props: { groupId: data, fromOrganicUser: false } },
      { userId: user.id },
    );

    const { data: latest } = await supabase
      .from("challenges")
      .select("id, status")
      .eq("group_id", data)
      .in("status", ["pending", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const redirectTo =
      latest?.status === "pending"
        ? `/challenge/${latest.id}/pledge`
        : latest?.status === "active"
          ? `/challenge/${latest.id}?joined_late=1`
          : `/group/${data}?joined=1`;

    const prefs = await fetchNotificationPrefs(user.id);
    const notifPromptRequired = prefs.start === false;

    return success({ groupId: data, redirectTo, notifPromptRequired });
  },
);

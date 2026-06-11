"use server";

import { redirect } from "next/navigation";
import { withUser } from "@/lib/auth/with-user";
import { createClient } from "@/lib/supabase/server";
import { failure, success, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";

// /me 로그아웃 — supabase 세션 정리 후 /login 으로 이동.
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
import {
  notificationPrefsSchema,
  pushSubscriptionSchema,
  unregisterPushSchema,
  type NotificationPrefs,
  type PushSubscriptionInput,
  type UnregisterPushInput,
} from "@withkey/domain";

export const registerPushSubscription = withUser<PushSubscriptionInput, { ok: true }>(
  async (user, input): Promise<ActionResult<{ ok: true }>> => {
    const parsed = pushSubscriptionSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.p256dh,
        auth: parsed.data.auth,
      },
      { onConflict: "endpoint" },
    );
    if (error) return failure(mapSupabaseError(error));
    return success({ ok: true });
  },
);

export const unregisterPushSubscription = withUser<UnregisterPushInput, { ok: true }>(
  async (user, input): Promise<ActionResult<{ ok: true }>> => {
    const parsed = unregisterPushSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .match({ user_id: user.id, endpoint: parsed.data.endpoint });
    if (error) return failure(mapSupabaseError(error));
    return success({ ok: true });
  },
);

// 사용자가 "알림을 모두 끄겠다" 의사를 표시했을 때 호출한다.
// browser 쪽 unsubscribe 결과가 null / stale 이라서 endpoint 기반 정리만
// 하면 서버 row 가 남아 중복 dispatch 로 이어지므로, user_id 기준 전부 제거.
export const clearMyPushSubscriptions = withUser<void, { ok: true }>(
  async (user): Promise<ActionResult<{ ok: true }>> => {
    const supabase = await createClient();
    const { error } = await supabase.from("push_subscriptions").delete().eq("user_id", user.id);
    if (error) return failure(mapSupabaseError(error));
    return success({ ok: true });
  },
);

export const updateNotificationPrefs = withUser<NotificationPrefs, { ok: true }>(
  async (user, input): Promise<ActionResult<{ ok: true }>> => {
    const parsed = notificationPrefsSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const supabase = await createClient();
    const { error } = await supabase
      .from("users")
      .update({ notification_prefs: parsed.data })
      .eq("id", user.id);
    if (error) return failure(mapSupabaseError(error));
    return success({ ok: true });
  },
);

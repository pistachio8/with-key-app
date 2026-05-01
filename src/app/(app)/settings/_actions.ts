"use server";

import { withUser } from "@/lib/auth/with-user";
import { createClient } from "@/lib/supabase/server";
import {
  failure,
  success,
  validationFailure,
  type ActionResult,
} from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import {
  notificationPrefsSchema,
  pushSubscriptionSchema,
  unregisterPushSchema,
  type NotificationPrefs,
  type PushSubscriptionInput,
  type UnregisterPushInput,
} from "@/lib/validators/push";

export const registerPushSubscription = withUser<
  PushSubscriptionInput,
  { ok: true }
>(async (user, input): Promise<ActionResult<{ ok: true }>> => {
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
});

export const unregisterPushSubscription = withUser<
  UnregisterPushInput,
  { ok: true }
>(async (user, input): Promise<ActionResult<{ ok: true }>> => {
  const parsed = unregisterPushSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .match({ user_id: user.id, endpoint: parsed.data.endpoint });
  if (error) return failure(mapSupabaseError(error));
  return success({ ok: true });
});

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

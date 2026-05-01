import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  notificationPrefsSchema,
  type NotificationPrefs,
} from "@/lib/validators/push";

const DEFAULT_PREFS: NotificationPrefs = { start: true, deadline: true };

export async function fetchNotificationPrefs(
  userId: string,
): Promise<NotificationPrefs> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("notification_prefs")
    .eq("id", userId)
    .single();
  if (error || !data) return DEFAULT_PREFS;
  const parsed = notificationPrefsSchema.safeParse(data.notification_prefs);
  return parsed.success ? parsed.data : DEFAULT_PREFS;
}

export async function fetchActiveSubscriptionEndpoint(
  userId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("push_subscriptions")
    .select("endpoint")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.endpoint ?? null;
}

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { notificationPrefsSchema, type NotificationPrefs } from "@/lib/validators/push";

// 신규 가입자 / parse 실패 fallback 은 OFF — 명시적 토글 ON 시점에 iOS 권한 프롬프트가
// 트리거되도록 한다. DB column default 도 같이 OFF 로 migration (0031) 적용해 정합 유지.
const DEFAULT_PREFS: NotificationPrefs = { start: false, deadline: false };

export async function fetchNotificationPrefs(userId: string): Promise<NotificationPrefs> {
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

export async function fetchActiveSubscriptionEndpoint(userId: string): Promise<string | null> {
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

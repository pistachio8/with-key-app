import { requireUser } from "@/lib/auth/require-user";
import {
  fetchActiveSubscriptionEndpoint,
  fetchNotificationPrefs,
} from "@/lib/db/reads/notification-prefs";
import { PushSettings } from "./_components/push-settings";

// PRD §6.3 AC-6 · Design Brief §1.5 · 화면 9
export default async function SettingsPage() {
  const user = await requireUser();
  const [prefs, endpoint] = await Promise.all([
    fetchNotificationPrefs(user.id),
    fetchActiveSubscriptionEndpoint(user.id),
  ]);
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

  return (
    <div className="flex flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">설정</h1>
      <PushSettings
        initialPrefs={prefs}
        initialSubscribedEndpoint={endpoint}
        vapidPublicKey={vapidPublicKey}
      />
    </div>
  );
}

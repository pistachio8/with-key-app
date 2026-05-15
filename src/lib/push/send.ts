import { configurePush, webpush } from "./vapid";

export type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  // 알림 센터(IDB) 적재용 — SW 가 payload.type/category/targetUrl/id 를 사용.
  // PRD §9.1 notification_sent 의 type 과 동일 값 + 카테고리 그룹.
  type?: "start" | "deadline" | "missed_yesterday" | "friend_action" | "penalty_added";
  category?: "reminder" | "friend_action" | "penalty";
  targetUrl?: string;
  id?: string;
  challengeId?: string;
};

// PRD §6.3 AC-5: 새벽 2~7시 (KST) 발송 금지.
export function isQuietHoursKST(now: Date = new Date()): boolean {
  const kstHour = (now.getUTCHours() + 9) % 24;
  return kstHour >= 2 && kstHour < 7;
}

export async function sendPush(
  subscription: PushSubscriptionRow,
  payload: PushPayload,
): Promise<void> {
  configurePush();
  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    JSON.stringify(payload),
  );
}

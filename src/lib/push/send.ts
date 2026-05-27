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
  type?:
    | "start"
    | "deadline"
    | "missed_yesterday"
    | "friend_action"
    | "penalty_added"
    | "kudos_received";
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

// Apple Push gateway (web.push.apple.com) 는 RFC 8030 `Urgency` 헤더가 `high` 가 아니면
// device idle/sleep 시 deferrable 로 분류해 silently drop 하는 사례가 보고된다 (Apple WebKit
// blog "Web Push for Web Apps on iOS and iPadOS", 2023-03). FCM 은 같은 헤더를 관대하게
// 받아들여 안드만 도착하는 비대칭이 발생. user-visible push 이므로 항상 `high` 로 고정.
//
// `TTL` 은 일부 web-push 버전 default 가 0 인데 Apple 은 TTL=0 + device offline → 즉시 drop.
// 24h 로 잡아 잠금/사용 안 함 상태에서도 다음 wake 때 delivery 보장.
//
// `topic` 은 같은 종류 알림의 stale 항목을 push 서비스 단에서 coalesce — 알림 누락 해결과
// 직접 무관하지만 노티 센터 noise 감소 (Apple 권장, max 32 chars URL/filename-safe Base64).
const PUSH_TTL_SECONDS = 60 * 60 * 24;
const PUSH_URGENCY = "high" as const;

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
    {
      TTL: PUSH_TTL_SECONDS,
      urgency: PUSH_URGENCY,
      topic: payload.type?.slice(0, 32),
    },
  );
}

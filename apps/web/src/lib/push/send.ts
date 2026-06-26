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
// 24h 로 잡아 잠금/sleep 상태에서도 다음 wake 때 delivery 보장.
//
// `topic` 옵션은 의도적으로 제거함. PR #118 에서 `payload.type` (예: "kudos_received",
// "friend_action") 을 그대로 topic 으로 넘겼는데 Apple Push gateway 가 `400 BadWebPushTopic`
// 으로 reject (FCM 은 동일 값을 수락). RFC 8030 알파벳에는 부합하지만 Apple WebKit Push
// 의 미공개 추가 규칙(underscore 또는 영문 단어형 reject 추정) 을 통과 못 함. coalescing 은
// nice-to-have 이고 정확한 Apple-수용 format 이 미공개라 제거가 안전. 필요 시 추후 별도 PR
// 에서 SHA256-based base64url 등 alphanumeric-only 형태로 재도입 가능.
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
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Expo Push (ADR-0041) — RN device token 발송 경로. Web Push 와 dispatch 레이어를
// 공유하고 sender 만 교체한다. APNs/FCM 라우팅은 Expo Push Service 가 대행.
// ─────────────────────────────────────────────────────────────────────────────

export type ExpoPushTokenRow = {
  expoPushToken: string;
};

// "ok" = ticket 수락. "device-not-registered" = 회수 가능한 무효 토큰(호출자가 disabled_at soft-delete).
// transport 실패·rate limit·기타 ticket error 는 throw 로 신호 → 호출자(safeSend)가 failed 처리.
export type ExpoSendResult = "ok" | "device-not-registered";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

export async function sendExpoPush(
  token: ExpoPushTokenRow,
  payload: PushPayload,
): Promise<ExpoSendResult> {
  // Web Push 의 urgency=high / TTL=24h 정책(위 sendPush 주석)을 Expo 옵션으로 재지정(ADR-0041 §76).
  // priority=high → iOS APNs immediate · Android FCM high priority. ttl 은 초 단위.
  // payload.type/category/targetUrl 등 알림센터 분류 메타는 data 로 전달(RN 수신 핸들러 EVAL-0053 가 라우팅).
  const message = {
    to: token.expoPushToken,
    title: payload.title,
    body: payload.body,
    sound: "default",
    priority: PUSH_URGENCY,
    ttl: PUSH_TTL_SECONDS,
    data: {
      url: payload.url,
      type: payload.type,
      category: payload.category,
      targetUrl: payload.targetUrl,
      id: payload.id,
      challengeId: payload.challengeId,
    },
  };

  const res = await fetch(EXPO_PUSH_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(message),
    // cron·Server Action after() 컨텍스트에서 exp.host 지연 시 무기한 블록 방지(10s 상한).
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`expo push HTTP ${res.status}`);
  }

  // 단건 발송이라 data 는 ticket 객체(배열 아님). status=error + DeviceNotRegistered 만 회수 가능 무효 토큰.
  const json = (await res.json()) as {
    data?: { status?: string; message?: string; details?: { error?: string } };
  };
  const ticket = json.data;
  if (ticket?.status === "error") {
    if (ticket.details?.error === "DeviceNotRegistered") {
      return "device-not-registered";
    }
    throw new Error(
      `expo push ticket error: ${ticket.details?.error ?? ticket.message ?? "unknown"}`,
    );
  }
  return "ok";
}

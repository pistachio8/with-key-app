import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { track } from "@/lib/analytics/track";
import {
  isQuietHoursKST,
  sendPush,
  type PushPayload,
  type PushSubscriptionRow,
} from "@/lib/push/send";
import { notificationPrefsSchema, type NotificationPrefs } from "@/lib/validators/push";

type NotificationKind = "start" | "deadline";
type Outcome = "sent" | "cleaned" | "failed" | "suppressed";

type DispatchTarget = PushSubscriptionRow & { userId: string };

// 호출자가 사용자에게 사실 그대로 보고할 수 있도록, 발송이 끝난 뒤 무엇이 일어났는지 요약.
// `recipientCount` 는 옵트인 + 구독까지 마친 실제 발송 후보 수. `quietHours` 가 true 면 발송은 일어나지 않고 suppressed 트래킹만 남는다.
export type DispatchSummary = {
  recipientCount: number;
  quietHours: boolean;
};

async function loadTargets(
  challengeId: string,
  kind: NotificationKind,
  options: { excludeUserId?: string } = {},
): Promise<DispatchTarget[]> {
  const admin = adminClient();

  const { data: participants } = await admin
    .from("challenge_participants")
    .select("user_id")
    .eq("challenge_id", challengeId);

  let userIds = (participants ?? []).map((p) => p.user_id as string);
  if (options.excludeUserId) {
    userIds = userIds.filter((id) => id !== options.excludeUserId);
  }
  if (userIds.length === 0) return [];

  const { data: users } = await admin
    .from("users")
    .select("id, notification_prefs")
    .in("id", userIds);

  const optedIn = (users ?? [])
    .filter((u) => {
      const parsed = notificationPrefsSchema.safeParse(u.notification_prefs);
      if (!parsed.success) return false;
      const prefs: NotificationPrefs = parsed.data;
      return prefs[kind];
    })
    .map((u) => u.id as string);

  if (optedIn.length === 0) return [];

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .in("user_id", optedIn);

  return (subs ?? []).map((s) => ({
    userId: s.user_id as string,
    endpoint: s.endpoint as string,
    p256dh: s.p256dh as string,
    auth: s.auth as string,
  }));
}

export async function cleanupInvalidSubscription(endpoint: string): Promise<void> {
  const admin = adminClient();
  await admin.from("push_subscriptions").delete().match({ endpoint });
}

async function safeSend(
  target: DispatchTarget,
  payload: PushPayload,
): Promise<Exclude<Outcome, "suppressed">> {
  try {
    await sendPush(target, payload);
    return "sent";
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await cleanupInvalidSubscription(target.endpoint);
      return "cleaned";
    }
    return "failed";
  }
}

async function dispatch(
  challengeId: string,
  kind: NotificationKind,
  payload: PushPayload,
  options: { excludeUserId?: string } = {},
): Promise<DispatchSummary> {
  const targets = await loadTargets(challengeId, kind, options);
  const quietHours = isQuietHoursKST();
  if (targets.length === 0) return { recipientCount: 0, quietHours };

  // 병렬 송신: N=3~4 명 그룹에서도 직렬로는 합산 지연이 누적된다. 실패는 per-recipient 격리.
  await Promise.allSettled(
    targets.map(async (target) => {
      const outcome: Outcome = quietHours ? "suppressed" : await safeSend(target, payload);
      void track(
        {
          name: "notification_sent",
          props: {
            type: kind,
            challengeId,
            suppressed: quietHours,
            outcome,
          },
        },
        { userId: target.userId },
      );
    }),
  );

  return { recipientCount: targets.length, quietHours };
}

export async function dispatchStartNotification(challengeId: string): Promise<DispatchSummary> {
  const targetUrl = `/challenge/${challengeId}`;
  return dispatch(challengeId, "start", {
    title: "챌린지 시작이에요",
    body: "모두 서명했어요. 오늘부터 시작!",
    url: targetUrl,
    type: "start",
    category: "reminder",
    targetUrl,
    challengeId,
  });
}

// PRD §6.2 사용자가 "운동 시작" 탭 → 그룹원(본인 제외)에게 푸시.
// 메시지 본문은 PRD 예시 "JJ님이 운동을 시작했어요!" 형식.
export async function dispatchActionStartNotification(
  challengeId: string,
  actor: { userId: string; displayName: string },
): Promise<DispatchSummary> {
  const targetUrl = `/challenge/${challengeId}`;
  return dispatch(
    challengeId,
    "start",
    {
      title: "운동 시작",
      body: `${actor.displayName}님이 운동을 시작했어요!`,
      url: targetUrl,
      type: "friend_action",
      category: "friend_action",
      targetUrl,
      challengeId,
    },
    { excludeUserId: actor.userId },
  );
}

export async function dispatchDeadlineNotification(challengeId: string): Promise<DispatchSummary> {
  const targetUrl = `/challenge/${challengeId}/action`;
  return dispatch(challengeId, "deadline", {
    title: "마감 24시간 전",
    body: "아직 못 한 날이 있다면 지금!",
    url: targetUrl,
    type: "deadline",
    category: "reminder",
    targetUrl,
    challengeId,
  });
}

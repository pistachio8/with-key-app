import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { track } from "@/lib/analytics/track";
import {
  isQuietHoursKST,
  sendPush,
  type PushPayload,
  type PushSubscriptionRow,
} from "@/lib/push/send";
import {
  notificationPrefsSchema,
  type NotificationPrefs,
} from "@/lib/validators/push";

type NotificationKind = "start" | "deadline";
type Outcome = "sent" | "cleaned" | "failed" | "suppressed";

type DispatchTarget = PushSubscriptionRow & { userId: string };

async function loadTargets(
  challengeId: string,
  kind: NotificationKind,
): Promise<DispatchTarget[]> {
  const admin = adminClient();

  const { data: participants } = await admin
    .from("challenge_participants")
    .select("user_id")
    .eq("challenge_id", challengeId);

  const userIds = (participants ?? []).map((p) => p.user_id as string);
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
): Promise<void> {
  const targets = await loadTargets(challengeId, kind);
  if (targets.length === 0) return;
  const suppressed = isQuietHoursKST();

  for (const target of targets) {
    const outcome: Outcome = suppressed ? "suppressed" : await safeSend(target, payload);
    void track(
      {
        name: "notification_sent",
        props: {
          type: kind,
          challengeId,
          suppressed,
          outcome,
        },
      },
      { userId: target.userId },
    );
  }
}

export async function dispatchStartNotification(challengeId: string): Promise<void> {
  return dispatch(challengeId, "start", {
    title: "챌린지 시작이에요",
    body: "모두 서명했어요. 오늘부터 시작!",
    url: `/challenge/${challengeId}`,
  });
}

export async function dispatchDeadlineNotification(challengeId: string): Promise<void> {
  return dispatch(challengeId, "deadline", {
    title: "마감 24시간 전",
    body: "아직 못 한 날이 있다면 지금!",
    url: `/challenge/${challengeId}`,
  });
}

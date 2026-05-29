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
import type { KudosEmoji } from "@/lib/validators/kudos";
import type { ActivityType } from "@/lib/keywords/pool";

type NotificationKind = "start" | "deadline";
type NotificationSentType = "start" | "deadline" | "friend_action";
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
    // 진단용: Apple Push gateway (web.push.apple.com) 가 401/413/등 non-410 코드로 reject 할 때
    // safeSend 가 silently swallow 하던 흐름을 가시화. iOS PWA push 미수신 RCA 기간에만 유지하고,
    // 원인 식별 후 별도 PR 로 제거 예정. endpoint 는 origin prefix 만(80자) — 토큰부 노출 최소화.
    console.error("[push] webpush rejected", {
      endpointPrefix: target.endpoint.slice(0, 80),
      statusCode,
      body: (error as { body?: string })?.body,
      headers: (error as { headers?: Record<string, string> })?.headers,
    });
    return "failed";
  }
}

async function dispatch(
  challengeId: string,
  kind: NotificationKind,
  payload: PushPayload,
  options: { excludeUserId?: string; trackType?: NotificationSentType } = {},
): Promise<DispatchSummary> {
  const targets = await loadTargets(challengeId, kind, options);
  const quietHours = isQuietHoursKST();
  if (targets.length === 0) return { recipientCount: 0, quietHours };

  // notification_sent.type 은 분석용 — 게이팅 prefs 키(kind)와 분리한다.
  // 완료 푸시는 kind="start"(옵트인 키 재사용)지만 분석 type 은 "friend_action".
  const trackType: NotificationSentType = options.trackType ?? kind;

  // 병렬 송신: N=3~4 명 그룹에서도 직렬로는 합산 지연이 누적된다. 실패는 per-recipient 격리.
  await Promise.allSettled(
    targets.map(async (target) => {
      const outcome: Outcome = quietHours ? "suppressed" : await safeSend(target, payload);
      void track(
        {
          name: "notification_sent",
          props: {
            type: trackType,
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
    body: "오늘부터 시작!",
    url: targetUrl,
    type: "start",
    category: "reminder",
    targetUrl,
    challengeId,
  });
}

// PRD §6.4 — 그룹원이 사진 인증을 제출 완료하면 그룹원(본인 제외)에게 push.
// submitActionLog 성공 후 after() 로 fire. 매 제출마다 발송하되 그 날 첫 인증(isFirstOfDay)과
// 재제출 문구를 분기한다. 옵트인 게이팅은 기존 "start" prefs 키 재사용, 분석 type 은 friend_action.
const COMPLETED_TITLE_FIRST: Record<ActivityType, string> = {
  running: "🏃 러닝 인증!",
  gym: "🏋️ 헬스 인증!",
  yoga: "🧘 요가 인증!",
  other: "✨ 인증 도착!",
  meal: "🥗 식단 인증!",
};
const COMPLETED_TITLE_REPEAT: Record<ActivityType, string> = {
  running: "🏃 러닝 또!",
  gym: "🏋️ 헬스 또!",
  yoga: "🧘 요가 또!",
  other: "✨ 또 인증!",
  meal: "🥗 식단 또!",
};

export async function dispatchActionCompletedNotification(
  challengeId: string,
  actor: { userId: string; displayName: string },
  options: { activityType: ActivityType; isFirstOfDay: boolean },
): Promise<DispatchSummary> {
  const targetUrl = `/challenge/${challengeId}`;
  const title = options.isFirstOfDay
    ? COMPLETED_TITLE_FIRST[options.activityType]
    : COMPLETED_TITLE_REPEAT[options.activityType];
  const body = options.isFirstOfDay
    ? `${actor.displayName}님이 오늘 인증을 완료했어요 💪`
    : `${actor.displayName}님이 한 번 더 인증했어요`;
  return dispatch(
    challengeId,
    "start",
    {
      title,
      body,
      url: targetUrl,
      type: "friend_action",
      category: "friend_action",
      targetUrl,
      challengeId,
    },
    { excludeUserId: actor.userId, trackType: "friend_action" },
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

// ADR-0016 / ADR-0017 / plan 2026-05-22-kudos-received-notification
// 내 인증글에 다른 사용자가 kudos INSERT 시 작성자에게 1:1 push 발송.
// DELETE 는 호출자가 차단(toggleKudos 의 INSERT 분기만 호출). closed/pending 챌린지는 skip.
// dedup 은 kudos_push_log UNIQUE PK 로 atomic — race-free.
export async function dispatchKudosReceivedNotification(args: {
  recipientUserId: string;
  actorUserId: string;
  actorDisplayName: string;
  actionLogId: string;
  challengeId: string;
  emoji: KudosEmoji;
}): Promise<DispatchSummary> {
  const { recipientUserId, actorUserId, actorDisplayName, actionLogId, challengeId, emoji } = args;
  const quietHours = isQuietHoursKST();
  const admin = adminClient();

  // 1. 본인→본인 방어 (RLS 가 1차 차단하지만 dispatch 단 2차 가드 — DB 왕복 절약).
  if (recipientUserId === actorUserId) {
    return { recipientCount: 0, quietHours };
  }

  // 2. A3 (PO 결정 2026-05-22) — closed/pending 챌린지 옛 인증글에 달린 응원은 push 안 함.
  const { data: challenge } = await admin
    .from("challenges")
    .select("status")
    .eq("id", challengeId)
    .maybeSingle();
  if (!challenge || challenge.status !== "active") {
    return { recipientCount: 0, quietHours };
  }

  // 3. recipient 의 kudos 옵트인 확인.
  const { data: recipient } = await admin
    .from("users")
    .select("notification_prefs")
    .eq("id", recipientUserId)
    .maybeSingle();
  const prefs = notificationPrefsSchema.safeParse(recipient?.notification_prefs);
  if (!prefs.success || !prefs.data.kudos) {
    return { recipientCount: 0, quietHours };
  }

  // 4. recipient 의 push_subscriptions 로드. 구독 미존재면 dedup 선예약 자체를 안 한다.
  // 미구독 시점 응원이 dedup 만 남기고 silent return 하면, 추후 구독한 사용자가 같은 actor 의
  // 같은 글 응원을 영원히 못 받는 회귀가 된다 (RCA 2026-05-27 — POC dogfood 중 실측).
  // 보존 정책의 손해(드물게 같은 글에 재발송) 보다 발송 누락 손해가 더 큼.
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .eq("user_id", recipientUserId);
  const targets: DispatchTarget[] = (subs ?? []).map((s) => ({
    userId: s.user_id as string,
    endpoint: s.endpoint as string,
    p256dh: s.p256dh as string,
    auth: s.auth as string,
  }));

  if (targets.length === 0) {
    return { recipientCount: 0, quietHours };
  }

  // 5. H1 dedup 선예약 — kudos_push_log UNIQUE PK 로 atomic.
  // ON CONFLICT 면 maybeSingle 가 null 리턴 → 이미 발송된 조합으로 판정.
  // 구독 존재 확정 후 INSERT 하므로 stale dedup 회귀 없음. UNIQUE PK 가 race serialize.
  const { data: reserved, error: reserveErr } = await admin
    .from("kudos_push_log")
    .insert({
      recipient_user_id: recipientUserId,
      action_log_id: actionLogId,
      actor_user_id: actorUserId,
    })
    .select("recipient_user_id")
    .maybeSingle();
  if (reserveErr || !reserved) {
    return { recipientCount: 0, quietHours };
  }

  const targetUrl = `/challenge/${challengeId}`;
  const payload: PushPayload = {
    title: "응원이 도착했어요",
    body: `${actorDisplayName}님이 ${emoji}을 보냈어요`,
    url: targetUrl,
    type: "kudos_received",
    category: "friend_action",
    targetUrl,
    challengeId,
  };

  const outcomes = await Promise.all(
    targets.map(async (target): Promise<Outcome> => {
      const outcome: Outcome = quietHours ? "suppressed" : await safeSend(target, payload);
      void track(
        {
          name: "notification_sent",
          props: {
            type: "kudos_received",
            challengeId,
            suppressed: quietHours,
            outcome,
            actionLogId,
            actorUserId,
          },
        },
        { userId: target.userId },
      );
      return outcome;
    }),
  );

  // 보상: 모든 디바이스가 failed (cleaned/sent/suppressed 가 하나도 없음) → dedup row 삭제.
  // 한 디바이스라도 sent/cleaned/suppressed 면 보상하지 않음 (재발송 risk 회피).
  const everyFailed = outcomes.length > 0 && outcomes.every((o) => o === "failed");
  if (everyFailed) {
    await admin.from("kudos_push_log").delete().match({
      recipient_user_id: recipientUserId,
      action_log_id: actionLogId,
      actor_user_id: actorUserId,
    });
  }

  return { recipientCount: targets.length, quietHours };
}

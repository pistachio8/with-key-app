import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { track } from "@/lib/analytics/track";
import { isQuietHoursKST, sendPush, sendExpoPush, type PushPayload } from "@/lib/push/send";
import {
  notificationPrefsSchema,
  type NotificationPrefs,
  type KudosEmoji,
  type ActivityType,
  formatKRW,
} from "@withkey/domain";

type NotificationKind = "start" | "deadline";
type NotificationSentType = "start" | "deadline" | "friend_action";
type Outcome = "sent" | "cleaned" | "failed" | "suppressed";

// ADR-0041 — 전환기 두 푸시 모델 공존. web=Web Push 구독(push_subscriptions),
// expo=RN device token(device_push_tokens). 수신자 선정·quiet hours·dedup 은 모델 무관이고
// sender 만 kind 로 분기한다(safeSend). 무효 토큰 정리도 모델별로 다름(web=hard delete, expo=soft).
type WebTarget = {
  kind: "web";
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};
type ExpoTarget = {
  kind: "expo";
  userId: string;
  deviceId: string;
  expoPushToken: string;
};
type DispatchTarget = WebTarget | ExpoTarget;

// 호출자가 사용자에게 사실 그대로 보고할 수 있도록, 발송이 끝난 뒤 무엇이 일어났는지 요약.
// `recipientCount` 는 옵트인 + 구독까지 마친 실제 발송 후보 수. `quietHours` 가 true 면 발송은 일어나지 않고 suppressed 트래킹만 남는다.
export type DispatchSummary = {
  recipientCount: number;
  quietHours: boolean;
};

// 한 user 집합의 발송 대상(web 구독 + Expo 토큰)을 모은다. ADR-0041 provider 추상화의 load 단계 —
// "누가 받을지"(수신자 선정)는 호출자가 끝낸 뒤, 그 user 들의 디바이스 토큰만 여기서 읽는다.
async function loadUserPushTargets(
  admin: ReturnType<typeof adminClient>,
  userIds: string[],
): Promise<DispatchTarget[]> {
  if (userIds.length === 0) return [];

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  const webTargets: WebTarget[] = (subs ?? []).map((s) => ({
    kind: "web",
    userId: s.user_id as string,
    endpoint: s.endpoint as string,
    p256dh: s.p256dh as string,
    auth: s.auth as string,
  }));

  // disabled_at(DeviceNotRegistered soft-delete) 토큰은 발송 제외. service-role read 라 RLS 우회 —
  // 이 read 는 authorization gate 가 아니라 발송 타깃팅이므로 필터를 코드에서 적용한다.
  const { data: tokens } = await admin
    .from("device_push_tokens")
    .select("user_id, device_id, expo_push_token, disabled_at")
    .in("user_id", userIds);
  const expoTargets: ExpoTarget[] = (tokens ?? [])
    .filter((t) => !t.disabled_at)
    .map((t) => ({
      kind: "expo",
      userId: t.user_id as string,
      deviceId: t.device_id as string,
      expoPushToken: t.expo_push_token as string,
    }));

  return [...webTargets, ...expoTargets];
}

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

  return loadUserPushTargets(admin, optedIn);
}

export async function cleanupInvalidSubscription(endpoint: string): Promise<void> {
  const admin = adminClient();
  await admin.from("push_subscriptions").delete().match({ endpoint });
}

// Expo 무효 토큰은 hard-delete 대신 soft-delete(disabled_at) — 재등록 시 (user_id,device_id) upsert 로
// 재활성, 갱신 이력 보존(ADR-0041 §69). Web Push 의 endpoint hard-delete 와 의도적으로 다르다.
async function disableExpoToken(expoPushToken: string): Promise<void> {
  const admin = adminClient();
  await admin
    .from("device_push_tokens")
    .update({ disabled_at: new Date().toISOString() })
    .match({ expo_push_token: expoPushToken });
}

async function safeSend(
  target: DispatchTarget,
  payload: PushPayload,
): Promise<Exclude<Outcome, "suppressed">> {
  if (target.kind === "expo") {
    try {
      const result = await sendExpoPush({ expoPushToken: target.expoPushToken }, payload);
      if (result === "device-not-registered") {
        await disableExpoToken(target.expoPushToken);
        return "cleaned";
      }
      return "sent";
    } catch (error) {
      // Expo Push Service transport 실패·rate limit·기타 ticket error. 토큰부 노출 최소화(24자 prefix).
      console.error("[push] expo rejected", {
        tokenPrefix: target.expoPushToken.slice(0, 24),
        message: (error as { message?: string })?.message,
      });
      return "failed";
    }
  }

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

// 회복 불가(이번 주 목표 달성 수학적 불가) 전환 시 해당 사용자에게 1회 통지.
// give-up(인증 중단) 케이스는 제출이 없어 결과 모달로 못 잡으므로 일 경계 cron 이 이 경로로 알린다.
// dedup: events(notification_sent · user_id · props{type,challengeId,week}) 1건이라도 있으면 skip
//   → (challenge,user,week) 당 정확히 1회. cron 은 09:00 KST(비-Quiet Hours) 1회 실행이라 race 없음.
// 옵트인은 기존 "deadline" prefs 키 재사용(마감·벌금 리마인더 계열). 분석 type 은 "goal_unreachable",
// payload.type 은 알림센터 분류용으로 기존 "penalty_added"(category "penalty") 재사용 — send.ts·SW 불변.
export async function dispatchGoalUnreachableNotification(args: {
  challengeId: string;
  userId: string;
  week: number;
  atRiskAmount: number;
}): Promise<DispatchSummary> {
  const { challengeId, userId, week, atRiskAmount } = args;
  const quietHours = isQuietHoursKST();
  const admin = adminClient();

  // 1. dedup — 같은 (challenge,user,week) 로 이미 보냈으면 재발송 안 함.
  const { data: prior } = await admin
    .from("events")
    .select("id")
    .eq("name", "notification_sent")
    .eq("user_id", userId)
    .contains("props", { type: "goal_unreachable", challengeId, week })
    .limit(1);
  if ((prior ?? []).length > 0) {
    return { recipientCount: 0, quietHours };
  }

  // 2. 옵트인 (deadline 키 재사용).
  const { data: user } = await admin
    .from("users")
    .select("notification_prefs")
    .eq("id", userId)
    .maybeSingle();
  const prefs = notificationPrefsSchema.safeParse(user?.notification_prefs);
  if (!prefs.success || !prefs.data.deadline) {
    return { recipientCount: 0, quietHours };
  }

  // 3. 발송 대상(web 구독 + Expo 토큰).
  const targets = await loadUserPushTargets(admin, [userId]);
  if (targets.length === 0) {
    return { recipientCount: 0, quietHours };
  }

  const targetUrl = `/challenge/${challengeId}/dashboard`;
  const body =
    atRiskAmount > 0
      ? `이번 주 목표 달성이 어려워요 · 종료 시 +${formatKRW(atRiskAmount)} 확정`
      : "이번 주 목표 달성이 어려워요";
  const payload: PushPayload = {
    title: "이번 주 목표 달성 불가",
    body,
    url: targetUrl,
    type: "penalty_added",
    category: "penalty",
    targetUrl,
    challengeId,
  };

  await Promise.allSettled(
    targets.map(async (target) => {
      const outcome: Outcome = quietHours ? "suppressed" : await safeSend(target, payload);
      void track(
        {
          name: "notification_sent",
          props: { type: "goal_unreachable", challengeId, week, suppressed: quietHours, outcome },
        },
        { userId },
      );
    }),
  );

  return { recipientCount: targets.length, quietHours };
}

// C3 — 검증 이상 신호 알림(AC-owner-load-3). 오너 1명 수신(D1), deadline 옵트인 재사용(D2).
// dedup 은 events 조회((challengeId, week, anomalyReason) 1회) — 신규 컬럼 불필요(goal_unreachable 패턴).
// shadow 게이트(failed_rate enforce-only)는 호출자(cron)가 판단 — 이 함수는 받은 reason 을 발송만 한다.
export async function dispatchVerifyAnomalyNotification(args: {
  challengeId: string;
  ownerUserId: string;
  week: number;
  anomalyReason: "failed_rate" | "reject_rate";
}): Promise<DispatchSummary> {
  const { challengeId, ownerUserId, week, anomalyReason } = args;
  const quietHours = isQuietHoursKST();
  const admin = adminClient();

  // dedup 키는 spec C3 대로 (challengeId, week, anomalyReason) 3개 — user_id 의도적 미포함.
  // goal_unreachable 은 per-participant 라 .eq("user_id") 가 필요했지만 verify_anomaly 는
  // per-challenge(오너 1명)라 challenge·week·reason 만으로 유일. 챌린지당 오너가 1명이므로
  // 같은 키에 다른 user_id row 가 생길 수 없다.
  const { data: prior } = await admin
    .from("events")
    .select("id")
    .eq("name", "notification_sent")
    .contains("props", { type: "verify_anomaly", challengeId, week, anomalyReason })
    .limit(1);
  if ((prior ?? []).length > 0) return { recipientCount: 0, quietHours };

  // 옵트인 (deadline 키 재사용 — 운영 리마인더 계열, goal_unreachable 과 동일).
  const { data: owner } = await admin
    .from("users")
    .select("notification_prefs")
    .eq("id", ownerUserId)
    .maybeSingle();
  const prefs = notificationPrefsSchema.safeParse(owner?.notification_prefs);
  if (!prefs.success || !prefs.data.deadline) return { recipientCount: 0, quietHours };

  const targets = await loadUserPushTargets(admin, [ownerUserId]);
  if (targets.length === 0) return { recipientCount: 0, quietHours };

  const targetUrl = `/challenge/${challengeId}/dashboard`;
  const body =
    anomalyReason === "failed_rate"
      ? "자동 검증 실패가 늘고 있어요 · 확인이 필요해요"
      : "멤버 반려가 늘고 있어요 · 확인이 필요해요";
  const payload: PushPayload = {
    title: "검증 이상 신호",
    body,
    url: targetUrl,
    type: "penalty_added",
    category: "penalty",
    targetUrl,
    challengeId,
  };

  await Promise.allSettled(
    targets.map(async (target) => {
      const outcome: Outcome = quietHours ? "suppressed" : await safeSend(target, payload);
      void track(
        {
          name: "notification_sent",
          props: {
            type: "verify_anomaly",
            challengeId,
            week,
            anomalyReason,
            suppressed: quietHours,
            outcome,
          },
        },
        { userId: ownerUserId },
      );
    }),
  );

  return { recipientCount: targets.length, quietHours };
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

  // 4. 발송 대상(web 구독 + Expo 토큰) 로드. 대상 미존재면 dedup 선예약 자체를 안 한다.
  // 미등록 시점 응원이 dedup 만 남기고 silent return 하면, 추후 등록한 사용자가 같은 actor 의
  // 같은 글 응원을 영원히 못 받는 회귀가 된다 (RCA 2026-05-27 — POC dogfood 중 실측).
  // 보존 정책의 손해(드물게 같은 글에 재발송) 보다 발송 누락 손해가 더 큼.
  const targets = await loadUserPushTargets(admin, [recipientUserId]);

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

// ADR-0028 — 전원 서명 완료(마지막 서명자가 멤버) 시 오너 1명에게 시작 nudge.
// dedup 은 challenges.start_nudge_sent_at(sign RPC atomic)이 보장 — 여기선 보내기만 한다.
// 옵트인은 기존 "start" prefs 키 재사용, 분석 type 도 "start"(notification_sent union 불변).
// 푸시 실패/미구독 시 인앱 StartChallengeCard 가 fallback 이므로 kudos 식 보상 로직은 두지 않는다.
export async function dispatchOwnerStartNudge(
  challengeId: string,
  ownerUserId: string,
): Promise<DispatchSummary> {
  const quietHours = isQuietHoursKST();
  const admin = adminClient();

  const { data: owner } = await admin
    .from("users")
    .select("notification_prefs")
    .eq("id", ownerUserId)
    .maybeSingle();
  const prefs = notificationPrefsSchema.safeParse(owner?.notification_prefs);
  if (!prefs.success || !prefs.data.start) {
    return { recipientCount: 0, quietHours };
  }

  const targets = await loadUserPushTargets(admin, [ownerUserId]);
  if (targets.length === 0) {
    return { recipientCount: 0, quietHours };
  }

  const targetUrl = `/challenge/${challengeId}`;
  const payload: PushPayload = {
    title: "전원 서명 완료 🎉",
    body: "이제 챌린지를 시작할 수 있어요",
    url: targetUrl,
    type: "start",
    category: "reminder",
    targetUrl,
    challengeId,
  };

  await Promise.allSettled(
    targets.map(async (target) => {
      const outcome: Outcome = quietHours ? "suppressed" : await safeSend(target, payload);
      void track(
        {
          name: "notification_sent",
          props: { type: "start", challengeId, suppressed: quietHours, outcome },
        },
        { userId: target.userId },
      );
    }),
  );

  return { recipientCount: targets.length, quietHours };
}

// 새 서약서(pending 챌린지) 생성 시 기존 그룹 멤버(오너 제외)에게 서명 유도 push.
// create_challenge 가 그룹 멤버 전원을 미서명 참가자로 시드하므로 참가자 fan-out
// 헬퍼 dispatch() 를 그대로 재사용한다(오너는 excludeUserId 로 제외 — 본인이 생성).
// 생성은 1회성이라 dedup 컬럼 불필요 — createChallenge 성공 후 after() 로 1회 발사.
// 옵트인은 기존 "start" 키, 분석 type 도 "start"(notification_sent union 불변).
// 미옵트인/실패 시 인앱 InvitedChallengeBanner 가 fallback.
export async function dispatchNewChallengeCreatedNotification(
  challengeId: string,
  ownerUserId: string,
  challengeTitle: string,
): Promise<DispatchSummary> {
  const targetUrl = `/challenge/${challengeId}/pledge`;
  return dispatch(
    challengeId,
    "start",
    {
      title: "새 서약서가 도착했어요",
      body: `${challengeTitle} · 탭해서 서명하기`,
      url: targetUrl,
      type: "start",
      category: "reminder",
      targetUrl,
      challengeId,
    },
    { excludeUserId: ownerUserId },
  );
}

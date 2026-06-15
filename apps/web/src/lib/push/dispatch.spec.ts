import { beforeEach, describe, expect, it, vi } from "vitest";

// -----------------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------------

type AdminResponse = { data: unknown; error: unknown };

// Each `from(table)` call pulls the next queued "table plan" and returns a chain
// whose terminal methods resolve the plan's rows. This keeps per-test DB setup
// explicit instead of hiding it behind shared state.
const tablePlans: Array<{
  table: string;
  rows: unknown;
  error?: unknown;
}> = [];
const deletedEndpoints: string[] = [];

function chainResolvingTo(rows: unknown, error: unknown = null) {
  const resolved: AdminResponse = { data: rows, error };
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.in = () => chain;
  chain.contains = () => chain;
  chain.gt = () => chain;
  chain.not = () => chain;
  chain.limit = () => chain;
  chain.maybeSingle = () => Promise.resolve(resolved);
  chain.then = (onFulfilled: (r: AdminResponse) => unknown) => onFulfilled(resolved);
  return chain;
}

function makeDeleteChain() {
  const chain: Record<string, unknown> = {};
  chain.match = (where: { endpoint?: string }) => {
    if (where?.endpoint) deletedEndpoints.push(where.endpoint);
    return Promise.resolve({ data: null, error: null } satisfies AdminResponse);
  };
  return chain;
}

const from = vi.fn((table: string) => {
  const next = tablePlans.shift();
  if (!next) {
    return {
      select: () => chainResolvingTo([]),
      delete: () => makeDeleteChain(),
    };
  }
  if (next.table !== table) {
    throw new Error(`dispatch test expected next from() to be "${next.table}", got "${table}"`);
  }
  return {
    select: () => chainResolvingTo(next.rows, next.error ?? null),
    delete: () => makeDeleteChain(),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({ from }),
}));

const sendPush = vi.fn();
const isQuietHoursKST = vi.fn();
vi.mock("@/lib/push/send", () => ({
  sendPush: (...args: unknown[]) => sendPush(...args),
  isQuietHoursKST: () => isQuietHoursKST(),
}));

const trackCalls: Array<{ event: unknown; options: unknown }> = [];
vi.mock("@/lib/analytics/track", () => ({
  track: async (event: unknown, options: unknown) => {
    trackCalls.push({ event, options });
  },
}));

import {
  dispatchActionCompletedNotification,
  dispatchGoalUnreachableNotification,
  dispatchStartNotification,
  dispatchVerifyAnomalyNotification,
} from "./dispatch";

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

const CHALLENGE_ID = "00000000-0000-4000-8000-000000000001";

function queueHappyPath(
  overrides: {
    participants?: Array<{ user_id: string }>;
    users?: Array<{ id: string; notification_prefs: unknown }>;
    subs?: Array<{
      user_id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
    }>;
  } = {},
) {
  tablePlans.push({
    table: "challenge_participants",
    rows: overrides.participants ?? [{ user_id: "user-a" }, { user_id: "user-b" }],
  });
  tablePlans.push({
    table: "users",
    rows: overrides.users ?? [
      { id: "user-a", notification_prefs: { start: true, deadline: true, kudos: false } },
      { id: "user-b", notification_prefs: { start: true, deadline: true, kudos: false } },
    ],
  });
  tablePlans.push({
    table: "push_subscriptions",
    rows: overrides.subs ?? [
      { user_id: "user-a", endpoint: "ep-a", p256dh: "p", auth: "a" },
      { user_id: "user-b", endpoint: "ep-b", p256dh: "p", auth: "a" },
    ],
  });
}

beforeEach(() => {
  tablePlans.length = 0;
  deletedEndpoints.length = 0;
  trackCalls.length = 0;
  sendPush.mockReset();
  sendPush.mockResolvedValue(undefined);
  isQuietHoursKST.mockReset();
  isQuietHoursKST.mockReturnValue(false);
  from.mockClear();
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("dispatchStartNotification", () => {
  it("returns silently when the challenge has no participants", async () => {
    tablePlans.push({ table: "challenge_participants", rows: [] });
    await dispatchStartNotification(CHALLENGE_ID);
    expect(sendPush).not.toHaveBeenCalled();
    expect(trackCalls).toHaveLength(0);
  });

  it("sends push only to participants opted in with prefs.start=true", async () => {
    queueHappyPath({
      users: [
        { id: "user-a", notification_prefs: { start: true, deadline: true, kudos: false } },
        { id: "user-b", notification_prefs: { start: false, deadline: true, kudos: false } },
      ],
      subs: [{ user_id: "user-a", endpoint: "ep-a", p256dh: "p", auth: "a" }],
    });

    await dispatchStartNotification(CHALLENGE_ID);

    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(sendPush).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "ep-a" }),
      expect.objectContaining({ title: expect.any(String) }),
    );
    const sentEvent = trackCalls.find(
      (c) => (c.event as { props?: { outcome?: string } }).props?.outcome === "sent",
    );
    expect(sentEvent).toBeDefined();
    expect((sentEvent!.options as { userId?: string }).userId).toBe("user-a");
  });

  it("skips sendPush during quiet hours but still records suppressed events", async () => {
    isQuietHoursKST.mockReturnValue(true);
    queueHappyPath();

    await dispatchStartNotification(CHALLENGE_ID);

    expect(sendPush).not.toHaveBeenCalled();
    expect(trackCalls).toHaveLength(2);
    for (const call of trackCalls) {
      expect(
        (call.event as { props: { suppressed: boolean; outcome: string } }).props,
      ).toMatchObject({ suppressed: true, outcome: "suppressed" });
    }
  });

  it("cleans up subscriptions on 410 Gone and records outcome=cleaned", async () => {
    queueHappyPath({
      participants: [{ user_id: "user-a" }],
      users: [{ id: "user-a", notification_prefs: { start: true, deadline: true, kudos: false } }],
      subs: [{ user_id: "user-a", endpoint: "ep-gone", p256dh: "p", auth: "a" }],
    });
    const err = Object.assign(new Error("gone"), { statusCode: 410 });
    sendPush.mockRejectedValue(err);

    await dispatchStartNotification(CHALLENGE_ID);

    expect(deletedEndpoints).toEqual(["ep-gone"]);
    expect(trackCalls).toHaveLength(1);
    expect((trackCalls[0].event as { props: { outcome: string } }).props.outcome).toBe("cleaned");
  });

  it("records outcome=failed on non-Gone errors without deleting subscription", async () => {
    queueHappyPath({
      participants: [{ user_id: "user-a" }],
      users: [{ id: "user-a", notification_prefs: { start: true, deadline: true, kudos: false } }],
      subs: [{ user_id: "user-a", endpoint: "ep-a", p256dh: "p", auth: "a" }],
    });
    const err = Object.assign(new Error("boom"), { statusCode: 500 });
    sendPush.mockRejectedValue(err);

    await dispatchStartNotification(CHALLENGE_ID);

    expect(deletedEndpoints).toHaveLength(0);
    expect(trackCalls).toHaveLength(1);
    expect((trackCalls[0].event as { props: { outcome: string } }).props.outcome).toBe("failed");
  });

  it("skips users whose prefs fail schema validation", async () => {
    queueHappyPath({
      participants: [{ user_id: "user-x" }, { user_id: "user-y" }],
      users: [
        { id: "user-x", notification_prefs: "garbage" },
        { id: "user-y", notification_prefs: { start: true, deadline: true, kudos: false } },
      ],
      subs: [{ user_id: "user-y", endpoint: "ep-y", p256dh: "p", auth: "a" }],
    });

    await dispatchStartNotification(CHALLENGE_ID);

    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(sendPush).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "ep-y" }),
      expect.anything(),
    );
  });
});

describe("dispatchActionCompletedNotification", () => {
  it("첫 인증(isFirstOfDay=true): 활동별 title + 완료 body, actor 제외", async () => {
    queueHappyPath({
      participants: [{ user_id: "actor" }, { user_id: "user-b" }, { user_id: "user-c" }],
      users: [
        { id: "user-b", notification_prefs: { start: true, deadline: true, kudos: false } },
        { id: "user-c", notification_prefs: { start: true, deadline: true, kudos: false } },
      ],
      subs: [
        { user_id: "user-b", endpoint: "ep-b", p256dh: "p", auth: "a" },
        { user_id: "user-c", endpoint: "ep-c", p256dh: "p", auth: "a" },
      ],
    });

    await dispatchActionCompletedNotification(
      CHALLENGE_ID,
      { userId: "actor", displayName: "민지" },
      { activityType: "gym", isFirstOfDay: true },
    );

    expect(sendPush).toHaveBeenCalledTimes(2);
    for (const [, payload] of sendPush.mock.calls) {
      expect((payload as { title: string }).title).toBe("🏋️ 헬스 인증!");
      expect((payload as { body: string }).body).toBe("민지님이 오늘 인증을 완료했어요 💪");
      expect((payload as { type: string }).type).toBe("friend_action");
      expect((payload as { category: string }).category).toBe("friend_action");
    }
    const recipientIds = trackCalls.map((c) => (c.options as { userId?: string }).userId);
    expect(recipientIds).toEqual(expect.arrayContaining(["user-b", "user-c"]));
    expect(recipientIds).not.toContain("actor");
    // notification_sent.type 은 friend_action (게이팅 키 start 와 분리)
    for (const c of trackCalls) {
      expect((c.event as { props: { type: string } }).props.type).toBe("friend_action");
    }
  });

  it("재제출(isFirstOfDay=false): 활동별 '또' title + 재제출 body", async () => {
    queueHappyPath({
      participants: [{ user_id: "actor" }, { user_id: "user-b" }],
      users: [{ id: "user-b", notification_prefs: { start: true, deadline: true, kudos: false } }],
      subs: [{ user_id: "user-b", endpoint: "ep-b", p256dh: "p", auth: "a" }],
    });

    await dispatchActionCompletedNotification(
      CHALLENGE_ID,
      { userId: "actor", displayName: "민지" },
      { activityType: "meal", isFirstOfDay: false },
    );

    expect(sendPush).toHaveBeenCalledTimes(1);
    const [, payload] = sendPush.mock.calls[0]!;
    expect((payload as { title: string }).title).toBe("🥗 식단 또!");
    expect((payload as { body: string }).body).toBe("민지님이 한 번 더 인증했어요");
  });

  it("기타(other) 활동은 활동명 없는 title", async () => {
    queueHappyPath({
      participants: [{ user_id: "actor" }, { user_id: "user-b" }],
      users: [{ id: "user-b", notification_prefs: { start: true, deadline: true, kudos: false } }],
      subs: [{ user_id: "user-b", endpoint: "ep-b", p256dh: "p", auth: "a" }],
    });

    await dispatchActionCompletedNotification(
      CHALLENGE_ID,
      { userId: "actor", displayName: "민지" },
      { activityType: "other", isFirstOfDay: true },
    );

    const [, payload] = sendPush.mock.calls[0]!;
    expect((payload as { title: string }).title).toBe("✨ 인증 도착!");
  });

  it("actor가 유일 참가자면 발송하지 않는다", async () => {
    tablePlans.push({ table: "challenge_participants", rows: [{ user_id: "solo" }] });

    await dispatchActionCompletedNotification(
      CHALLENGE_ID,
      { userId: "solo", displayName: "혼자" },
      { activityType: "gym", isFirstOfDay: true },
    );

    expect(sendPush).not.toHaveBeenCalled();
    expect(trackCalls).toHaveLength(0);
  });
});

describe("dispatchGoalUnreachableNotification", () => {
  const args = { challengeId: CHALLENGE_ID, userId: "user-a", week: 1, atRiskAmount: 3000 };

  it("이미 (challenge,user,week) 로 보냈으면 skip (events dedup)", async () => {
    tablePlans.push({ table: "events", rows: [{ id: "prior" }] });
    const r = await dispatchGoalUnreachableNotification(args);
    expect(r.recipientCount).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
    expect(trackCalls).toHaveLength(0);
  });

  it("deadline 옵트인 off 면 skip", async () => {
    tablePlans.push({ table: "events", rows: [] });
    tablePlans.push({
      table: "users",
      rows: { notification_prefs: { start: true, deadline: false, kudos: false } },
    });
    const r = await dispatchGoalUnreachableNotification(args);
    expect(r.recipientCount).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("미발송 + 옵트인 시 push + track(type=goal_unreachable, week, userId)", async () => {
    tablePlans.push({ table: "events", rows: [] });
    tablePlans.push({
      table: "users",
      rows: { notification_prefs: { start: true, deadline: true, kudos: false } },
    });
    tablePlans.push({
      table: "push_subscriptions",
      rows: [{ user_id: "user-a", endpoint: "ep-a", p256dh: "p", auth: "a" }],
    });

    const r = await dispatchGoalUnreachableNotification(args);

    expect(r.recipientCount).toBe(1);
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(sendPush).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "ep-a" }),
      expect.objectContaining({
        title: "이번 주 목표 달성 불가",
        body: expect.stringContaining("3,000"),
      }),
    );
    expect(trackCalls).toHaveLength(1);
    const ev = trackCalls[0].event as {
      props: { type: string; week: number; outcome: string };
    };
    expect(ev.props.type).toBe("goal_unreachable");
    expect(ev.props.week).toBe(1);
    expect(ev.props.outcome).toBe("sent");
    expect((trackCalls[0].options as { userId?: string }).userId).toBe("user-a");
  });
});

describe("dispatchVerifyAnomalyNotification", () => {
  const args = {
    challengeId: CHALLENGE_ID,
    ownerUserId: "owner-a",
    week: 1,
    anomalyReason: "reject_rate" as const,
  };

  it("같은 (challengeId, week, anomalyReason) prior 존재 시 skip (events dedup)", async () => {
    tablePlans.push({ table: "events", rows: [{ id: "prior" }] });
    const r = await dispatchVerifyAnomalyNotification(args);
    expect(r.recipientCount).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
    expect(trackCalls).toHaveLength(0);
  });

  it("deadline 옵트인 off 면 skip (D2)", async () => {
    tablePlans.push({ table: "events", rows: [] });
    tablePlans.push({
      table: "users",
      rows: { notification_prefs: { start: true, deadline: false, kudos: false } },
    });
    const r = await dispatchVerifyAnomalyNotification(args);
    expect(r.recipientCount).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("미발송 + 옵트인 시 push + track(type=verify_anomaly, anomalyReason, week, ownerUserId)", async () => {
    tablePlans.push({ table: "events", rows: [] });
    tablePlans.push({
      table: "users",
      rows: { notification_prefs: { start: true, deadline: true, kudos: false } },
    });
    tablePlans.push({
      table: "push_subscriptions",
      rows: [{ user_id: "owner-a", endpoint: "ep-owner", p256dh: "p", auth: "a" }],
    });

    const r = await dispatchVerifyAnomalyNotification(args);

    expect(r.recipientCount).toBe(1);
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(sendPush).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "ep-owner" }),
      expect.objectContaining({ title: "검증 이상 신호" }),
    );
    expect(trackCalls).toHaveLength(1);
    const ev = trackCalls[0].event as {
      props: { type: string; anomalyReason: string; week: number; outcome: string };
    };
    expect(ev.props.type).toBe("verify_anomaly");
    expect(ev.props.anomalyReason).toBe("reject_rate");
    expect(ev.props.week).toBe(1);
    expect(ev.props.outcome).toBe("sent");
    expect((trackCalls[0].options as { userId?: string }).userId).toBe("owner-a");
  });
});

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
    throw new Error(
      `dispatch test expected next from() to be "${next.table}", got "${table}"`,
    );
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

import { dispatchStartNotification } from "./dispatch";

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

const CHALLENGE_ID = "00000000-0000-4000-8000-000000000001";

function queueHappyPath(overrides: {
  participants?: Array<{ user_id: string }>;
  users?: Array<{ id: string; notification_prefs: unknown }>;
  subs?: Array<{
    user_id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>;
} = {}) {
  tablePlans.push({
    table: "challenge_participants",
    rows: overrides.participants ?? [
      { user_id: "user-a" },
      { user_id: "user-b" },
    ],
  });
  tablePlans.push({
    table: "users",
    rows: overrides.users ?? [
      { id: "user-a", notification_prefs: { start: true, deadline: true } },
      { id: "user-b", notification_prefs: { start: true, deadline: true } },
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
        { id: "user-a", notification_prefs: { start: true, deadline: true } },
        { id: "user-b", notification_prefs: { start: false, deadline: true } },
      ],
      subs: [
        { user_id: "user-a", endpoint: "ep-a", p256dh: "p", auth: "a" },
      ],
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
      expect((call.event as { props: { suppressed: boolean; outcome: string } }).props)
        .toMatchObject({ suppressed: true, outcome: "suppressed" });
    }
  });

  it("cleans up subscriptions on 410 Gone and records outcome=cleaned", async () => {
    queueHappyPath({
      participants: [{ user_id: "user-a" }],
      users: [
        { id: "user-a", notification_prefs: { start: true, deadline: true } },
      ],
      subs: [
        { user_id: "user-a", endpoint: "ep-gone", p256dh: "p", auth: "a" },
      ],
    });
    const err = Object.assign(new Error("gone"), { statusCode: 410 });
    sendPush.mockRejectedValue(err);

    await dispatchStartNotification(CHALLENGE_ID);

    expect(deletedEndpoints).toEqual(["ep-gone"]);
    expect(trackCalls).toHaveLength(1);
    expect(
      (trackCalls[0].event as { props: { outcome: string } }).props.outcome,
    ).toBe("cleaned");
  });

  it("records outcome=failed on non-Gone errors without deleting subscription", async () => {
    queueHappyPath({
      participants: [{ user_id: "user-a" }],
      users: [
        { id: "user-a", notification_prefs: { start: true, deadline: true } },
      ],
      subs: [
        { user_id: "user-a", endpoint: "ep-a", p256dh: "p", auth: "a" },
      ],
    });
    const err = Object.assign(new Error("boom"), { statusCode: 500 });
    sendPush.mockRejectedValue(err);

    await dispatchStartNotification(CHALLENGE_ID);

    expect(deletedEndpoints).toHaveLength(0);
    expect(trackCalls).toHaveLength(1);
    expect(
      (trackCalls[0].event as { props: { outcome: string } }).props.outcome,
    ).toBe("failed");
  });

  it("skips users whose prefs fail schema validation", async () => {
    queueHappyPath({
      participants: [{ user_id: "user-x" }, { user_id: "user-y" }],
      users: [
        { id: "user-x", notification_prefs: "garbage" },
        { id: "user-y", notification_prefs: { start: true, deadline: true } },
      ],
      subs: [
        { user_id: "user-y", endpoint: "ep-y", p256dh: "p", auth: "a" },
      ],
    });

    await dispatchStartNotification(CHALLENGE_ID);

    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(sendPush).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "ep-y" }),
      expect.anything(),
    );
  });
});

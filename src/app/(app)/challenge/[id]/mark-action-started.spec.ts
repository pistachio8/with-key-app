import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// -----------------------------------------------------------------------------
// Mock infra
// -----------------------------------------------------------------------------
//
// Each test queues per-table resolvers. Any chain method (.select/.eq/.contains
// /.gte/.in/.limit/.maybeSingle …) returns the same chain, and awaiting the
// chain resolves the next queued result for that table. This avoids hand-rolling
// a chain shape per call site.

type Resolver = { data: unknown; error: unknown };

const queues = new Map<string, Resolver[]>();
function enqueue(table: string, r: Resolver) {
  const arr = queues.get(table) ?? [];
  arr.push(r);
  queues.set(table, arr);
}
function dequeue(table: string): Resolver {
  const arr = queues.get(table) ?? [];
  if (arr.length === 0) {
    throw new Error(`mark-action-started.spec: no queued resolver for table "${table}"`);
  }
  return arr.shift()!;
}

function makeChain(table: string) {
  const chain: Record<string, unknown> = {};
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === "then") {
        return (onFulfilled: (r: Resolver) => unknown) => onFulfilled(dequeue(table));
      }
      return () => proxy;
    },
  };
  const proxy = new Proxy(chain, handler);
  return proxy;
}

const USER_ID = "11111111-1111-1111-1111-111111111111";
const CHALLENGE_ID = "22222222-2222-4222-8222-222222222222";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: USER_ID, email: "u@test.local" } },
        error: null,
      }),
    },
    from: (table: string) => makeChain(table),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({ from: (table: string) => makeChain(table) }),
}));

const trackCalls: Array<{ event: unknown; options: unknown }> = [];
vi.mock("@/lib/analytics/track", () => ({
  track: async (event: unknown, options: unknown) => {
    trackCalls.push({ event, options });
  },
}));

const dispatchActionStartNotification = vi.fn();
vi.mock("@/lib/push/dispatch", () => ({
  dispatchActionStartNotification: (...args: unknown[]) => dispatchActionStartNotification(...args),
}));

const isQuietHoursKST = vi.fn(() => false);
vi.mock("@/lib/push/send", () => ({
  isQuietHoursKST: () => isQuietHoursKST(),
}));

import { markActionStarted } from "./_actions";

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

function activeChallengeNow() {
  return {
    user_id: USER_ID,
    challenges: {
      status: "active",
      start_at: new Date(Date.now() - 60_000).toISOString(),
      end_at: new Date(Date.now() + 60_000).toISOString(),
    },
  };
}

function queueHappyPath(displayName: string | null = "민지", todayEvents: unknown[] = []) {
  enqueue("challenge_participants", { data: activeChallengeNow(), error: null });
  enqueue("events", { data: todayEvents, error: null });
  enqueue("users", { data: { display_name: displayName }, error: null });
}

beforeEach(() => {
  queues.clear();
  trackCalls.length = 0;
  dispatchActionStartNotification.mockReset();
  dispatchActionStartNotification.mockResolvedValue({ recipientCount: 2, quietHours: false });
  isQuietHoursKST.mockReset();
  isQuietHoursKST.mockReturnValue(false);
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("markActionStarted", () => {
  it("rejects invalid challengeId without touching db", async () => {
    const res = await markActionStarted({ challengeId: "not-a-uuid" });
    expect(res.ok).toBe(false);
    expect(dispatchActionStartNotification).not.toHaveBeenCalled();
    expect(trackCalls).toHaveLength(0);
  });

  it("returns not_found when membership row is missing (RLS or non-participant)", async () => {
    enqueue("challenge_participants", { data: null, error: null });

    const res = await markActionStarted({ challengeId: CHALLENGE_ID });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("not_found");
    expect(dispatchActionStartNotification).not.toHaveBeenCalled();
  });

  it("returns forbidden when challenge is not active", async () => {
    enqueue("challenge_participants", {
      data: {
        user_id: USER_ID,
        challenges: {
          status: "pending",
          start_at: new Date().toISOString(),
          end_at: new Date(Date.now() + 60_000).toISOString(),
        },
      },
      error: null,
    });

    const res = await markActionStarted({ challengeId: CHALLENGE_ID });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("forbidden");
    expect(dispatchActionStartNotification).not.toHaveBeenCalled();
  });

  it("returns forbidden when current time is outside challenge window", async () => {
    enqueue("challenge_participants", {
      data: {
        user_id: USER_ID,
        challenges: {
          status: "active",
          start_at: new Date(Date.now() + 60_000).toISOString(),
          end_at: new Date(Date.now() + 120_000).toISOString(),
        },
      },
      error: null,
    });

    const res = await markActionStarted({ challengeId: CHALLENGE_ID });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("forbidden");
    expect(dispatchActionStartNotification).not.toHaveBeenCalled();
  });

  it("returns skipped=true when an action_started event already exists today", async () => {
    enqueue("challenge_participants", { data: activeChallengeNow(), error: null });
    enqueue("events", { data: [{ id: 99 }], error: null });

    const res = await markActionStarted({ challengeId: CHALLENGE_ID });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.skipped).toBe(true);
      expect(res.data.recipientCount).toBe(0);
      expect(res.data.quietHours).toBe(false);
    }
    expect(dispatchActionStartNotification).not.toHaveBeenCalled();
    expect(trackCalls).toHaveLength(0);
  });

  it("happy path: tracks action_started and surfaces dispatch summary", async () => {
    queueHappyPath("민지");
    dispatchActionStartNotification.mockResolvedValueOnce({
      recipientCount: 2,
      quietHours: false,
    });

    const res = await markActionStarted({ challengeId: CHALLENGE_ID });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.skipped).toBe(false);
      expect(res.data.recipientCount).toBe(2);
      expect(res.data.quietHours).toBe(false);
    }

    expect(trackCalls).toHaveLength(1);
    const ev = trackCalls[0]!.event as { name: string; props: { challengeId: string } };
    expect(ev.name).toBe("action_started");
    expect(ev.props.challengeId).toBe(CHALLENGE_ID);
    expect((trackCalls[0]!.options as { userId?: string }).userId).toBe(USER_ID);

    expect(dispatchActionStartNotification).toHaveBeenCalledWith(CHALLENGE_ID, {
      userId: USER_ID,
      displayName: "민지",
    });
  });

  it("surfaces quietHours=true when dispatch reports quiet hours suppression", async () => {
    queueHappyPath("민지");
    dispatchActionStartNotification.mockResolvedValueOnce({
      recipientCount: 2,
      quietHours: true,
    });

    const res = await markActionStarted({ challengeId: CHALLENGE_ID });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.quietHours).toBe(true);
      expect(res.data.recipientCount).toBe(2);
    }
  });

  it("surfaces recipientCount=0 when actor is the only participant", async () => {
    queueHappyPath("민지");
    dispatchActionStartNotification.mockResolvedValueOnce({
      recipientCount: 0,
      quietHours: false,
    });

    const res = await markActionStarted({ challengeId: CHALLENGE_ID });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.recipientCount).toBe(0);
  });

  it("falls back to '친구' when display_name is null", async () => {
    queueHappyPath(null);

    const res = await markActionStarted({ challengeId: CHALLENGE_ID });

    expect(res.ok).toBe(true);
    expect(dispatchActionStartNotification).toHaveBeenCalledWith(CHALLENGE_ID, {
      userId: USER_ID,
      displayName: "친구",
    });
  });

  it("returns success with quietHours fallback when dispatch throws", async () => {
    queueHappyPath("민지");
    dispatchActionStartNotification.mockRejectedValueOnce(new Error("push offline"));
    isQuietHoursKST.mockReturnValueOnce(false);

    const res = await markActionStarted({ challengeId: CHALLENGE_ID });

    // dispatch 실패 시 사용자 응답은 success 유지하되 recipientCount=0/quietHours 는 isQuietHoursKST() 로 폴백.
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.skipped).toBe(false);
      expect(res.data.recipientCount).toBe(0);
    }
  });
});

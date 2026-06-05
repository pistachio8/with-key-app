import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// 각 테스트가 테이블별 resolver 를 큐잉. 모든 체인 메서드는 같은 체인을 반환하고,
// 체인을 await 하면 해당 테이블의 다음 큐 결과를 resolve.
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
      getClaims: async () => ({
        data: { claims: { sub: USER_ID, email: "u@test.local" } },
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

import { markActionStarted } from "./_actions";

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

function queueHappyPath(todayEvents: unknown[] = []) {
  enqueue("challenge_participants", { data: activeChallengeNow(), error: null });
  enqueue("events", { data: todayEvents, error: null });
}

beforeEach(() => {
  queues.clear();
  trackCalls.length = 0;
});

describe("markActionStarted (analytics only)", () => {
  it("rejects invalid challengeId without touching db", async () => {
    const res = await markActionStarted({ challengeId: "not-a-uuid" });
    expect(res.ok).toBe(false);
    expect(trackCalls).toHaveLength(0);
  });

  it("returns not_found when membership row is missing", async () => {
    enqueue("challenge_participants", { data: null, error: null });
    const res = await markActionStarted({ challengeId: CHALLENGE_ID });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("not_found");
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
  });

  it("returns skipped=true when an action_started event already exists today", async () => {
    enqueue("challenge_participants", { data: activeChallengeNow(), error: null });
    enqueue("events", { data: [{ id: 99 }], error: null });
    const res = await markActionStarted({ challengeId: CHALLENGE_ID });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.skipped).toBe(true);
    expect(trackCalls).toHaveLength(0);
  });

  it("happy path: tracks action_started once and returns skipped=false", async () => {
    queueHappyPath();
    const res = await markActionStarted({ challengeId: CHALLENGE_ID });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.skipped).toBe(false);

    expect(trackCalls).toHaveLength(1);
    const ev = trackCalls[0]!.event as { name: string; props: { challengeId: string } };
    expect(ev.name).toBe("action_started");
    expect(ev.props.challengeId).toBe(CHALLENGE_ID);
    expect((trackCalls[0]!.options as { userId?: string }).userId).toBe(USER_ID);
  });
});

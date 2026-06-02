import { beforeEach, describe, expect, it, vi } from "vitest";

// dispatch.spec.ts 의 tablePlans 패턴을 미러링 — from(table) 호출마다 다음 plan 을 꺼내
// 해당 테이블의 행을 resolve 한다. dispatchNewChallengeCreatedNotification 은 내부적으로
// private dispatch(kind="start", excludeUserId=owner) 를 재사용하므로
// challenge_participants → users → push_subscriptions 순으로 조회한다.

type AdminResponse = { data: unknown; error: unknown };

const tablePlans: Array<{ table: string; rows: unknown; error?: unknown }> = [];

function chainResolvingTo(rows: unknown, error: unknown = null) {
  const resolved: AdminResponse = { data: rows, error };
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.in = () => chain;
  chain.then = (onFulfilled: (r: AdminResponse) => unknown) => onFulfilled(resolved);
  return chain;
}

const from = vi.fn((table: string) => {
  const next = tablePlans.shift();
  if (!next) return { select: () => chainResolvingTo([]) };
  if (next.table !== table) {
    throw new Error(`expected next from() to be "${next.table}", got "${table}"`);
  }
  return { select: () => chainResolvingTo(next.rows, next.error ?? null) };
});

vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({ from }) }));

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

import { dispatchNewChallengeCreatedNotification } from "./dispatch";

const CHALLENGE_ID = "00000000-0000-4000-8000-000000000001";
const OWNER = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const TITLE = "주 3회 러닝";

beforeEach(() => {
  tablePlans.length = 0;
  trackCalls.length = 0;
  sendPush.mockReset();
  sendPush.mockResolvedValue(undefined);
  isQuietHoursKST.mockReset();
  isQuietHoursKST.mockReturnValue(false);
  from.mockClear();
});

describe("dispatchNewChallengeCreatedNotification", () => {
  it("오너 제외, 옵트인 멤버에게 /pledge 딥링크 push 1건", async () => {
    // loadTargets 가 excludeUserId(owner)로 userIds 를 거른 뒤 users 를 조회하므로
    // users/subs plan 에는 멤버만 둔다.
    tablePlans.push({
      table: "challenge_participants",
      rows: [{ user_id: OWNER }, { user_id: MEMBER }],
    });
    tablePlans.push({
      table: "users",
      rows: [{ id: MEMBER, notification_prefs: { start: true, deadline: false, kudos: false } }],
    });
    tablePlans.push({
      table: "push_subscriptions",
      rows: [{ user_id: MEMBER, endpoint: "ep-m", p256dh: "p", auth: "a" }],
    });

    const res = await dispatchNewChallengeCreatedNotification(CHALLENGE_ID, OWNER, TITLE);

    expect(res.recipientCount).toBe(1);
    expect(sendPush).toHaveBeenCalledTimes(1);
    const [, payload] = sendPush.mock.calls[0]!;
    expect((payload as { title: string }).title).toBe("새 서약서가 도착했어요");
    expect((payload as { type: string }).type).toBe("start");
    expect((payload as { url: string }).url).toBe(`/challenge/${CHALLENGE_ID}/pledge`);
    expect((payload as { body: string }).body).toContain(TITLE);
    // 트래킹은 멤버에게만, 오너 제외.
    const recipientIds = trackCalls.map((c) => (c.options as { userId?: string }).userId);
    expect(recipientIds).toEqual([MEMBER]);
    expect(recipientIds).not.toContain(OWNER);
  });

  it("quiet hours 면 발송하지 않고 suppressed 트래킹", async () => {
    isQuietHoursKST.mockReturnValue(true);
    tablePlans.push({
      table: "challenge_participants",
      rows: [{ user_id: OWNER }, { user_id: MEMBER }],
    });
    tablePlans.push({
      table: "users",
      rows: [{ id: MEMBER, notification_prefs: { start: true, deadline: false, kudos: false } }],
    });
    tablePlans.push({
      table: "push_subscriptions",
      rows: [{ user_id: MEMBER, endpoint: "ep-m", p256dh: "p", auth: "a" }],
    });

    const res = await dispatchNewChallengeCreatedNotification(CHALLENGE_ID, OWNER, TITLE);

    expect(res.quietHours).toBe(true);
    expect(sendPush).not.toHaveBeenCalled();
    expect(
      (trackCalls[0]!.event as { props: { suppressed: boolean; outcome: string } }).props,
    ).toMatchObject({ suppressed: true, outcome: "suppressed" });
  });
});

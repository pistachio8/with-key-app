// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  sendPush: vi.fn().mockResolvedValue(undefined),
  isQuietHoursKST: vi.fn().mockReturnValue(false),
  track: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/push/send", () => ({
  isQuietHoursKST: () => mocks.isQuietHoursKST(),
  sendPush: (...a: unknown[]) => mocks.sendPush(...a),
}));
vi.mock("@/lib/analytics/track", () => ({
  track: (...a: unknown[]) => mocks.track(...a),
}));

import { dispatchOwnerStartNudge } from "./dispatch";

const OWNER = "11111111-1111-4111-8111-111111111111";
const CH = "00000000-0000-4000-8000-000000000001";

// users.notification_prefs / push_subscriptions 조회를 테이블별로 분기하는 헬퍼.
function wireDb(opts: { prefs: unknown; subs: unknown[] }) {
  mocks.from.mockImplementation((table: string) => {
    if (table === "users") {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { notification_prefs: opts.prefs } }) }),
        }),
      };
    }
    if (table === "push_subscriptions") {
      return { select: () => ({ eq: async () => ({ data: opts.subs }) }) };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

beforeEach(() => {
  mocks.from.mockReset();
  mocks.sendPush.mockClear();
  mocks.track.mockClear();
  mocks.isQuietHoursKST.mockReturnValue(false);
});

describe("dispatchOwnerStartNudge", () => {
  it("오너가 start 옵트인 + 구독 있으면 푸시 1건 발송", async () => {
    wireDb({
      prefs: { start: true, deadline: false, kudos: false },
      subs: [{ user_id: OWNER, endpoint: "https://e", p256dh: "p", auth: "a" }],
    });
    const res = await dispatchOwnerStartNudge(CH, OWNER);
    expect(res.recipientCount).toBe(1);
    expect(mocks.sendPush).toHaveBeenCalledTimes(1);
    expect(mocks.track).toHaveBeenCalledTimes(1);
    const ev = mocks.track.mock.calls[0][0] as { name: string; props: { type: string } };
    expect(ev.name).toBe("notification_sent");
    expect(ev.props.type).toBe("start");
  });

  it("오너가 start 옵트아웃이면 미발송", async () => {
    wireDb({
      prefs: { start: false, deadline: false, kudos: false },
      subs: [{ user_id: OWNER, endpoint: "https://e", p256dh: "p", auth: "a" }],
    });
    const res = await dispatchOwnerStartNudge(CH, OWNER);
    expect(res.recipientCount).toBe(0);
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });

  it("quiet hours 면 발송하지 않고 suppressed 트래킹", async () => {
    mocks.isQuietHoursKST.mockReturnValue(true);
    wireDb({
      prefs: { start: true, deadline: false, kudos: false },
      subs: [{ user_id: OWNER, endpoint: "https://e", p256dh: "p", auth: "a" }],
    });
    const res = await dispatchOwnerStartNudge(CH, OWNER);
    expect(res.quietHours).toBe(true);
    expect(mocks.sendPush).not.toHaveBeenCalled();
    const ev = mocks.track.mock.calls[0][0] as { props: { suppressed: boolean; outcome: string } };
    expect(ev.props.suppressed).toBe(true);
    expect(ev.props.outcome).toBe("suppressed");
  });
});

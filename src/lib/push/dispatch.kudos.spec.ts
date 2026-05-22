import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KudosEmoji } from "@/lib/validators/kudos";

// dispatchKudosReceivedNotification 전용 spec. plan 2026-05-22-kudos-received-notification.

// vi.hoisted — vi.mock factory 가 import 보다 위로 끌어올려지므로 외부 const 는 TDZ.
// scenario/deletes 도 같이 hoist 해 mock factory closure 가 안전하게 참조하게 한다.
const state = vi.hoisted(() => {
  type SubsRow = { user_id: string; endpoint: string; p256dh: string; auth: string };
  type Scenario = {
    challenge?: { status: string } | null;
    recipientPrefs?: { notification_prefs: unknown } | null;
    reserveResult?: { data: unknown; error: { code: string } | null };
    subs?: SubsRow[];
  };
  return {
    scenario: {} as Scenario,
    deletes: [] as Array<{ table: string; match: unknown }>,
  };
});

const sendPush = vi.hoisted(() => vi.fn());
const isQuietHoursKST = vi.hoisted(() => vi.fn());
const trackCalls = vi.hoisted(() => [] as Array<{ event: unknown; options: unknown }>);

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({
    from(table: string) {
      if (table === "challenges") {
        return chain({
          maybeSingle: () =>
            Promise.resolve({ data: state.scenario.challenge ?? null, error: null }),
        });
      }
      if (table === "users") {
        return chain({
          maybeSingle: () =>
            Promise.resolve({ data: state.scenario.recipientPrefs ?? null, error: null }),
        });
      }
      if (table === "kudos_push_log") {
        return {
          insert: () => ({
            select: () => ({
              maybeSingle: () =>
                Promise.resolve(
                  state.scenario.reserveResult ?? {
                    data: { recipient_user_id: "r" },
                    error: null,
                  },
                ),
            }),
          }),
          delete: () => ({
            match: (m: unknown) => {
              state.deletes.push({ table: "kudos_push_log", match: m });
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      }
      if (table === "push_subscriptions") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: state.scenario.subs ?? [], error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

function chain(overrides: Record<string, unknown>) {
  // self-returning chain — select/eq/in 가 base 자체를 리턴해 후속 .maybeSingle()/etc.
  // 에서 overrides 가 보이도록 mutate.
  const base: Record<string, unknown> = {
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    ...overrides,
  };
  base.select = () => base;
  base.eq = () => base;
  base.in = () => base;
  return base;
}

vi.mock("@/lib/push/send", () => ({
  sendPush: (...args: unknown[]) => sendPush(...args),
  isQuietHoursKST: () => isQuietHoursKST(),
}));

vi.mock("@/lib/analytics/track", () => ({
  track: async (event: unknown, options: unknown) => {
    trackCalls.push({ event, options });
  },
}));

import { dispatchKudosReceivedNotification } from "./dispatch";

const ARGS = {
  recipientUserId: "11111111-1111-4111-8111-111111111111",
  actorUserId: "22222222-2222-4222-8222-222222222222",
  actorDisplayName: "테스터",
  actionLogId: "33333333-3333-4333-8333-333333333333",
  challengeId: "44444444-4444-4444-8444-444444444444",
  emoji: "👍" as KudosEmoji,
};

beforeEach(() => {
  delete state.scenario.challenge;
  delete state.scenario.recipientPrefs;
  delete state.scenario.reserveResult;
  delete state.scenario.subs;
  state.deletes.length = 0;
  trackCalls.length = 0;
  sendPush.mockReset();
  sendPush.mockResolvedValue(undefined);
  isQuietHoursKST.mockReset();
  isQuietHoursKST.mockReturnValue(false);
});

describe("dispatchKudosReceivedNotification", () => {
  it("본인=actor 면 즉시 skip (DB 접근 0)", async () => {
    const res = await dispatchKudosReceivedNotification({
      ...ARGS,
      actorUserId: ARGS.recipientUserId,
    });
    expect(res.recipientCount).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
    expect(trackCalls).toHaveLength(0);
  });

  it("A3: challenge.status !== 'active' 면 skip", async () => {
    state.scenario.challenge = { status: "closed" };
    const res = await dispatchKudosReceivedNotification(ARGS);
    expect(res.recipientCount).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("recipient prefs.kudos=false 면 skip", async () => {
    state.scenario.challenge = { status: "active" };
    state.scenario.recipientPrefs = {
      notification_prefs: { start: true, deadline: true, kudos: false },
    };
    const res = await dispatchKudosReceivedNotification(ARGS);
    expect(res.recipientCount).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("H1: kudos_push_log UNIQUE 충돌 (이미 발송됨) 시 skip", async () => {
    state.scenario.challenge = { status: "active" };
    state.scenario.recipientPrefs = {
      notification_prefs: { start: true, deadline: true, kudos: true },
    };
    state.scenario.reserveResult = { data: null, error: { code: "23505" } };
    const res = await dispatchKudosReceivedNotification(ARGS);
    expect(res.recipientCount).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("happy path — 디바이스 1개에 push 발송 + notification_sent 적재", async () => {
    state.scenario.challenge = { status: "active" };
    state.scenario.recipientPrefs = {
      notification_prefs: { start: true, deadline: true, kudos: true },
    };
    state.scenario.reserveResult = {
      data: { recipient_user_id: ARGS.recipientUserId },
      error: null,
    };
    state.scenario.subs = [
      { user_id: ARGS.recipientUserId, endpoint: "ep-r", p256dh: "p", auth: "a" },
    ];

    const res = await dispatchKudosReceivedNotification(ARGS);

    expect(res.recipientCount).toBe(1);
    expect(sendPush).toHaveBeenCalledTimes(1);
    const sent = trackCalls.find(
      (c) => (c.event as { props?: { outcome?: string } }).props?.outcome === "sent",
    );
    expect(sent).toBeDefined();
    expect((sent!.event as { props: { type: string; actionLogId?: string } }).props.type).toBe(
      "kudos_received",
    );
    expect((sent!.event as { props: { actionLogId?: string } }).props.actionLogId).toBe(
      ARGS.actionLogId,
    );
  });

  it("quietHours: send 생략 + dedup row 유지 (suppressed outcome)", async () => {
    isQuietHoursKST.mockReturnValue(true);
    state.scenario.challenge = { status: "active" };
    state.scenario.recipientPrefs = {
      notification_prefs: { start: true, deadline: true, kudos: true },
    };
    state.scenario.reserveResult = {
      data: { recipient_user_id: ARGS.recipientUserId },
      error: null,
    };
    state.scenario.subs = [
      { user_id: ARGS.recipientUserId, endpoint: "ep", p256dh: "p", auth: "a" },
    ];

    const res = await dispatchKudosReceivedNotification(ARGS);

    expect(res.quietHours).toBe(true);
    expect(sendPush).not.toHaveBeenCalled();
    const suppressed = trackCalls.find(
      (c) => (c.event as { props?: { outcome?: string } }).props?.outcome === "suppressed",
    );
    expect(suppressed).toBeDefined();
    expect(state.deletes).toHaveLength(0);
  });

  it("send 실패 (단일 디바이스 모두 fail) → dedup row 보상 삭제 → 재시도 가능", async () => {
    state.scenario.challenge = { status: "active" };
    state.scenario.recipientPrefs = {
      notification_prefs: { start: true, deadline: true, kudos: true },
    };
    state.scenario.reserveResult = {
      data: { recipient_user_id: ARGS.recipientUserId },
      error: null,
    };
    state.scenario.subs = [
      { user_id: ARGS.recipientUserId, endpoint: "ep", p256dh: "p", auth: "a" },
    ];
    sendPush.mockRejectedValue(Object.assign(new Error("boom"), { statusCode: 500 }));

    await dispatchKudosReceivedNotification(ARGS);

    expect(state.deletes).toHaveLength(1);
    expect(state.deletes[0].table).toBe("kudos_push_log");
  });
});

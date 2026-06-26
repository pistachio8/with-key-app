import { beforeEach, describe, expect, it, vi } from "vitest";

// ADR-0041 — dispatch sender 의 Expo(device_push_tokens) 발송 분기 전용 spec. Web Push 회귀는
// dispatch.spec.ts/kudos/nudge 가 보장하고, 여기선 Expo 토큰 타깃팅·소프트삭제·web+expo 공존을 본다.
// dispatchStartNotification(loadTargets fan-out → loadUserPushTargets)을 대표 경로로 사용.

const sendPush = vi.fn();
const sendExpoPush = vi.fn();
const isQuietHoursKST = vi.fn();
vi.mock("@/lib/push/send", () => ({
  sendPush: (...a: unknown[]) => sendPush(...a),
  sendExpoPush: (...a: unknown[]) => sendExpoPush(...a),
  isQuietHoursKST: () => isQuietHoursKST(),
}));

const trackCalls: Array<{ event: unknown; options: unknown }> = [];
vi.mock("@/lib/analytics/track", () => ({
  track: async (event: unknown, options: unknown) => {
    trackCalls.push({ event, options });
  },
}));

// 테이블별 분기 mock. 발송 대상 조회 순서: challenge_participants → users → push_subscriptions →
// device_push_tokens. device_push_tokens 는 select(.in) + update(.match) 둘 다 지원(soft-delete 검증).
const db = {
  participants: [] as Array<{ user_id: string }>,
  users: [] as Array<{ id: string; notification_prefs: unknown }>,
  subs: [] as unknown[],
  tokens: [] as unknown[],
  disabledTokens: [] as string[],
};

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({
    from(table: string) {
      if (table === "challenge_participants") {
        return { select: () => ({ eq: async () => ({ data: db.participants }) }) };
      }
      if (table === "users") {
        return { select: () => ({ in: async () => ({ data: db.users }) }) };
      }
      if (table === "push_subscriptions") {
        return { select: () => ({ in: async () => ({ data: db.subs }) }) };
      }
      if (table === "device_push_tokens") {
        return {
          select: () => ({ in: async () => ({ data: db.tokens }) }),
          update: (vals: { disabled_at?: string }) => ({
            match: async (m: { expo_push_token?: string }) => {
              if (m.expo_push_token && vals.disabled_at) db.disabledTokens.push(m.expo_push_token);
              return { data: null, error: null };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import { dispatchStartNotification } from "./dispatch";

const CH = "00000000-0000-4000-8000-000000000001";
const PREFS_ON = { start: true, deadline: true, kudos: true };

function token(expoPushToken: string, disabled_at: string | null = null) {
  return { user_id: "u1", device_id: "d1", expo_push_token: expoPushToken, disabled_at };
}

beforeEach(() => {
  db.participants = [{ user_id: "u1" }];
  db.users = [{ id: "u1", notification_prefs: PREFS_ON }];
  db.subs = [];
  db.tokens = [];
  db.disabledTokens = [];
  trackCalls.length = 0;
  sendPush.mockReset();
  sendPush.mockResolvedValue(undefined);
  sendExpoPush.mockReset();
  sendExpoPush.mockResolvedValue("ok");
  isQuietHoursKST.mockReset();
  isQuietHoursKST.mockReturnValue(false);
});

describe("dispatch — Expo device targets (ADR-0041)", () => {
  it("Expo 토큰 대상으로 sendExpoPush 발송 + outcome=sent", async () => {
    db.tokens = [token("ExponentPushToken[a]")];

    const res = await dispatchStartNotification(CH);

    expect(res.recipientCount).toBe(1);
    expect(sendExpoPush).toHaveBeenCalledTimes(1);
    expect(sendExpoPush).toHaveBeenCalledWith(
      { expoPushToken: "ExponentPushToken[a]" },
      expect.objectContaining({ type: "start" }),
    );
    expect(sendPush).not.toHaveBeenCalled();
    const sent = trackCalls.find(
      (c) => (c.event as { props?: { outcome?: string } }).props?.outcome === "sent",
    );
    expect(sent).toBeDefined();
  });

  it("DeviceNotRegistered → disabled_at soft-delete + outcome=cleaned", async () => {
    db.tokens = [token("ExponentPushToken[gone]")];
    sendExpoPush.mockResolvedValue("device-not-registered");

    const res = await dispatchStartNotification(CH);

    expect(res.recipientCount).toBe(1);
    expect(db.disabledTokens).toEqual(["ExponentPushToken[gone]"]);
    const cleaned = trackCalls.find(
      (c) => (c.event as { props?: { outcome?: string } }).props?.outcome === "cleaned",
    );
    expect(cleaned).toBeDefined();
  });

  it("disabled_at 토큰은 발송 대상에서 제외", async () => {
    db.tokens = [token("ExponentPushToken[off]", "2026-06-25T00:00:00Z")];

    const res = await dispatchStartNotification(CH);

    expect(res.recipientCount).toBe(0);
    expect(sendExpoPush).not.toHaveBeenCalled();
  });

  it("web 구독 + Expo 토큰 공존 시 양쪽 모두 발송", async () => {
    db.subs = [{ user_id: "u1", endpoint: "ep-1", p256dh: "p", auth: "a" }];
    db.tokens = [token("ExponentPushToken[a]")];

    const res = await dispatchStartNotification(CH);

    expect(res.recipientCount).toBe(2);
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(sendExpoPush).toHaveBeenCalledTimes(1);
  });

  it("Expo send 실패(throw) 시 outcome=failed, 토큰 disable 하지 않음", async () => {
    db.tokens = [token("ExponentPushToken[x]")];
    sendExpoPush.mockRejectedValue(new Error("boom"));

    await dispatchStartNotification(CH);

    expect(db.disabledTokens).toHaveLength(0);
    const failed = trackCalls.find(
      (c) => (c.event as { props?: { outcome?: string } }).props?.outcome === "failed",
    );
    expect(failed).toBeDefined();
  });

  it("quiet hours 면 Expo 발송 생략 + suppressed 트래킹", async () => {
    isQuietHoursKST.mockReturnValue(true);
    db.tokens = [token("ExponentPushToken[a]")];

    const res = await dispatchStartNotification(CH);

    expect(res.quietHours).toBe(true);
    expect(sendExpoPush).not.toHaveBeenCalled();
    const suppressed = trackCalls.find(
      (c) => (c.event as { props?: { outcome?: string } }).props?.outcome === "suppressed",
    );
    expect(suppressed).toBeDefined();
  });
});

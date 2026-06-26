import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// web-push 는 module-level singleton (`configurePush` 가 한 번만 setVapidDetails 호출) 이므로
// 호출 인자 검증을 위해 모듈 전체를 vi.mock 으로 가로챈다.
const sendNotification = vi.fn();
const setVapidDetails = vi.fn();

vi.mock("web-push", () => ({
  default: {
    sendNotification: (...args: unknown[]) => sendNotification(...args),
    setVapidDetails: (...args: unknown[]) => setVapidDetails(...args),
  },
}));

import { sendPush, sendExpoPush, isQuietHoursKST, type PushPayload } from "./send";

// VAPID env 가 set 되어 있어야 configurePush 가 throw 하지 않음.
beforeEach(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "BTEST_PUB";
  process.env.VAPID_PRIVATE_KEY = "TEST_PRIV";
  process.env.VAPID_SUBJECT = "mailto:test@example.com";
  sendNotification.mockReset();
  sendNotification.mockResolvedValue(undefined);
  setVapidDetails.mockReset();
});

describe("sendPush", () => {
  const subscription = {
    endpoint: "https://web.push.apple.com/abcd",
    p256dh: "p256dh-key",
    auth: "auth-key",
  };
  const payload: PushPayload = {
    title: "테스트",
    body: "본문",
    type: "start",
    category: "reminder",
    targetUrl: "/home",
  };

  it("passes urgency=high to webpush so Apple gateway does not defer-drop", async () => {
    await sendPush(subscription, payload);

    expect(sendNotification).toHaveBeenCalledTimes(1);
    const options = sendNotification.mock.calls[0][2];
    expect(options).toMatchObject({ urgency: "high" });
  });

  it("passes a non-zero TTL so device offline windows do not drop the push", async () => {
    await sendPush(subscription, payload);

    const options = sendNotification.mock.calls[0][2];
    // 24h 가 현재 정책. 정확한 값이 바뀌어도 0 보다 크면 회귀 아님.
    expect(typeof options.TTL).toBe("number");
    expect(options.TTL).toBeGreaterThan(0);
  });

  it("does NOT pass topic — Apple Push gateway rejects our payload.type values with BadWebPushTopic", async () => {
    // PR #118 에서 추가했던 `topic: payload.type` 옵션은 Apple 의 미공개 추가 규칙 (underscore
    // 또는 영문 단어형 reject 추정) 에 걸려 400 BadWebPushTopic. 옵션 자체를 빼서 회피.
    await sendPush(subscription, payload);

    const options = sendNotification.mock.calls[0][2];
    expect(options.topic).toBeUndefined();
  });

  it("serializes payload to JSON body and forwards subscription keys", async () => {
    await sendPush(subscription, payload);

    const [sub, body] = sendNotification.mock.calls[0];
    expect(sub).toEqual({
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    });
    expect(JSON.parse(body)).toMatchObject({ title: "테스트", body: "본문" });
  });

  it("still sets urgency/TTL when payload.type is undefined", async () => {
    const payloadNoType: PushPayload = { title: "T", body: "B" };
    await sendPush(subscription, payloadNoType);

    const options = sendNotification.mock.calls[0][2];
    expect(options.urgency).toBe("high");
    expect(options.TTL).toBeGreaterThan(0);
  });
});

describe("sendExpoPush", () => {
  const token = { expoPushToken: "ExponentPushToken[abcd]" };
  const payload: PushPayload = {
    title: "응원이 도착했어요",
    body: "테스터님이 👍을 보냈어요",
    type: "kudos_received",
    category: "friend_action",
    targetUrl: "/challenge/c1",
    challengeId: "c1",
  };

  function stubFetch(response: unknown, ok = true, status = 200) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok,
      status,
      json: async () => response,
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to Expo Push Service with to/title/body, priority=high, non-zero ttl, data meta", async () => {
    const fetchMock = stubFetch({ data: { status: "ok", id: "ticket-1" } });

    const result = await sendExpoPush(token, payload);

    expect(result).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://exp.host/--/api/v2/push/send");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    // Web Push 의 urgency=high / TTL>0 정책을 Expo priority/ttl 로 재지정(ADR-0041 §76).
    expect(body).toMatchObject({
      to: token.expoPushToken,
      title: payload.title,
      body: payload.body,
      priority: "high",
    });
    expect(body.ttl).toBeGreaterThan(0);
    // 알림센터 분류 메타는 data 로 전달.
    expect(body.data).toMatchObject({
      type: "kudos_received",
      category: "friend_action",
      targetUrl: "/challenge/c1",
      challengeId: "c1",
    });
  });

  it("returns 'device-not-registered' when the Expo ticket reports DeviceNotRegistered", async () => {
    stubFetch({
      data: {
        status: "error",
        message: "not registered",
        details: { error: "DeviceNotRegistered" },
      },
    });

    const result = await sendExpoPush(token, payload);

    expect(result).toBe("device-not-registered");
  });

  it("throws on non-2xx HTTP so the caller records outcome=failed", async () => {
    stubFetch("upstream error", false, 502);

    await expect(sendExpoPush(token, payload)).rejects.toThrow();
  });

  it("throws on ticket errors other than DeviceNotRegistered (no token disable)", async () => {
    stubFetch({ data: { status: "error", details: { error: "MessageTooBig" } } });

    await expect(sendExpoPush(token, payload)).rejects.toThrow();
  });
});

describe("isQuietHoursKST", () => {
  // KST = UTC+9. 1:00 KST = 16:00 UTC 전날, 6:59 KST = 21:59 UTC 전날.
  // quiet hours 정의: 2~7 KST (2 inclusive, 7 exclusive).
  it("returns false at 01:59 KST (just before quiet window)", () => {
    // 01:59 KST = 16:59 UTC 전날
    const d = new Date(Date.UTC(2026, 0, 1, 16, 59, 0));
    expect(isQuietHoursKST(d)).toBe(false);
  });

  it("returns true at 02:00 KST (start of quiet window)", () => {
    const d = new Date(Date.UTC(2026, 0, 1, 17, 0, 0));
    expect(isQuietHoursKST(d)).toBe(true);
  });

  it("returns true at 06:59 KST (last minute of quiet window)", () => {
    const d = new Date(Date.UTC(2026, 0, 1, 21, 59, 0));
    expect(isQuietHoursKST(d)).toBe(true);
  });

  it("returns false at 07:00 KST (end of quiet window, exclusive)", () => {
    const d = new Date(Date.UTC(2026, 0, 1, 22, 0, 0));
    expect(isQuietHoursKST(d)).toBe(false);
  });
});

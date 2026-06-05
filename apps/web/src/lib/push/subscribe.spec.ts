// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isPushSupported, syncBrowserSubscription, unsubscribeFromPush } from "./subscribe";

// 65-byte VAPID public key (1 + 32 + 32), base64url 로 인코딩하면 87 chars.
const VAPID_BASE64URL =
  "BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("isPushSupported", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when serviceWorker is missing from navigator", () => {
    vi.stubGlobal("navigator", {});
    expect(isPushSupported()).toBe(false);
  });

  it("returns false when PushManager is missing from window", () => {
    vi.stubGlobal("navigator", { serviceWorker: {} });
    vi.stubGlobal("window", {});
    expect(isPushSupported()).toBe(false);
  });

  it("returns true when serviceWorker + PushManager both present", () => {
    vi.stubGlobal("navigator", { serviceWorker: {} });
    vi.stubGlobal("window", { PushManager: class {} });
    expect(isPushSupported()).toBe(true);
  });
});

describe("syncBrowserSubscription", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when push is unsupported", async () => {
    vi.stubGlobal("navigator", {});
    await expect(syncBrowserSubscription(VAPID_BASE64URL)).rejects.toThrow("push_unsupported");
  });

  it("reuses existing subscription without calling subscribe()", async () => {
    const existingSub = {
      endpoint: "https://web.push.apple.com/abc",
      toJSON: () => ({
        endpoint: "https://web.push.apple.com/abc",
        keys: { p256dh: "p", auth: "a" },
      }),
    };
    const subscribeFn = vi.fn();
    const getSubscriptionFn = vi.fn().mockResolvedValue(existingSub);
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: { subscribe: subscribeFn, getSubscription: getSubscriptionFn },
        }),
      },
    });
    vi.stubGlobal("window", { PushManager: class {} });

    const out = await syncBrowserSubscription(VAPID_BASE64URL);

    expect(out).toEqual({
      endpoint: "https://web.push.apple.com/abc",
      p256dh: "p",
      auth: "a",
    });
    expect(getSubscriptionFn).toHaveBeenCalledTimes(1);
    expect(subscribeFn).not.toHaveBeenCalled();
  });

  it("subscribes when no existing subscription", async () => {
    const newSub = {
      endpoint: "https://fcm.googleapis.com/fcm/send/xyz",
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/fcm/send/xyz",
        keys: { p256dh: "p2", auth: "a2" },
      }),
    };
    const subscribeFn = vi.fn().mockResolvedValue(newSub);
    const getSubscriptionFn = vi.fn().mockResolvedValue(null);
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: { subscribe: subscribeFn, getSubscription: getSubscriptionFn },
        }),
      },
    });
    vi.stubGlobal("window", { PushManager: class {} });

    const out = await syncBrowserSubscription(VAPID_BASE64URL);

    expect(out).toEqual({
      endpoint: "https://fcm.googleapis.com/fcm/send/xyz",
      p256dh: "p2",
      auth: "a2",
    });
    expect(subscribeFn).toHaveBeenCalledTimes(1);
    const arg = subscribeFn.mock.calls[0][0];
    expect(arg.userVisibleOnly).toBe(true);
    expect(arg.applicationServerKey).toBeInstanceOf(Uint8Array);
    expect((arg.applicationServerKey as Uint8Array).length).toBeGreaterThan(0);
  });

  it("throws subscription_incomplete when keys missing", async () => {
    const incomplete = {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        keys: { p256dh: "", auth: "a" },
      }),
    };
    const subscribeFn = vi.fn().mockResolvedValue(incomplete);
    const getSubscriptionFn = vi.fn().mockResolvedValue(null);
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: { subscribe: subscribeFn, getSubscription: getSubscriptionFn },
        }),
      },
    });
    vi.stubGlobal("window", { PushManager: class {} });

    await expect(syncBrowserSubscription(VAPID_BASE64URL)).rejects.toThrow(
      "subscription_incomplete",
    );
  });
});

describe("unsubscribeFromPush", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when push is unsupported", async () => {
    vi.stubGlobal("navigator", {});
    await expect(unsubscribeFromPush()).resolves.toBeNull();
  });

  it("returns null when no existing subscription", async () => {
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: { getSubscription: () => Promise.resolve(null) },
        }),
      },
    });
    vi.stubGlobal("window", { PushManager: class {} });
    await expect(unsubscribeFromPush()).resolves.toBeNull();
  });

  it("unsubscribes existing registration and returns endpoint", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: () =>
              Promise.resolve({
                endpoint: "https://fcm.googleapis.com/fcm/send/x",
                unsubscribe,
              }),
          },
        }),
      },
    });
    vi.stubGlobal("window", { PushManager: class {} });

    await expect(unsubscribeFromPush()).resolves.toBe("https://fcm.googleapis.com/fcm/send/x");
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

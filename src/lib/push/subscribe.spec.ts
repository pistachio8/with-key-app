// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "./subscribe";

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

describe("subscribeToPush", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when push is unsupported", async () => {
    vi.stubGlobal("navigator", {});
    await expect(subscribeToPush(VAPID_BASE64URL)).rejects.toThrow(
      "push_unsupported",
    );
  });

  it("calls pushManager.subscribe with VAPID key and userVisibleOnly", async () => {
    const fakeSub = {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        keys: { p256dh: "p256", auth: "authKey" },
      }),
    };
    const subscribeFn = vi.fn().mockResolvedValue(fakeSub);
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve({ pushManager: { subscribe: subscribeFn } }),
      },
    });
    vi.stubGlobal("window", { PushManager: class {} });

    const out = await subscribeToPush(VAPID_BASE64URL);

    expect(out).toEqual({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      p256dh: "p256",
      auth: "authKey",
    });
    expect(subscribeFn).toHaveBeenCalledTimes(1);
    const arg = subscribeFn.mock.calls[0][0];
    expect(arg.userVisibleOnly).toBe(true);
    expect(arg.applicationServerKey).toBeInstanceOf(Uint8Array);
    expect((arg.applicationServerKey as Uint8Array).length).toBeGreaterThan(0);
  });

  it("throws when subscription JSON is missing keys", async () => {
    const incomplete = {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        keys: { p256dh: "", auth: "authKey" },
      }),
    };
    const subscribeFn = vi.fn().mockResolvedValue(incomplete);
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve({ pushManager: { subscribe: subscribeFn } }),
      },
    });
    vi.stubGlobal("window", { PushManager: class {} });

    await expect(subscribeToPush(VAPID_BASE64URL)).rejects.toThrow(
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

    await expect(unsubscribeFromPush()).resolves.toBe(
      "https://fcm.googleapis.com/fcm/send/x",
    );
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

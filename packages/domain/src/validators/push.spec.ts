import { describe, expect, it } from "vitest";
import { notificationPrefsSchema, pushSubscriptionSchema, unregisterPushSchema } from "./push";

describe("pushSubscriptionSchema", () => {
  it("accepts a valid https subscription", () => {
    const out = pushSubscriptionSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      p256dh: "BFNhBase64UrlKey",
      auth: "K9dAauthKey",
    });
    expect(out.success).toBe(true);
  });

  it("rejects a non-https endpoint", () => {
    const out = pushSubscriptionSchema.safeParse({
      endpoint: "http://attacker.com/push",
      p256dh: "BFNh",
      auth: "K9dA",
    });
    expect(out.success).toBe(false);
  });

  it("rejects empty keys", () => {
    const out = pushSubscriptionSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      p256dh: "",
      auth: "K9dA",
    });
    expect(out.success).toBe(false);
  });
});

describe("notificationPrefsSchema", () => {
  it("accepts three booleans (start/deadline/kudos)", () => {
    expect(
      notificationPrefsSchema.safeParse({ start: true, deadline: false, kudos: true }).success,
    ).toBe(true);
  });

  it("rejects when kudos key is missing (post migration 0033)", () => {
    expect(notificationPrefsSchema.safeParse({ start: true, deadline: false }).success).toBe(false);
  });

  it("rejects when start key is missing", () => {
    expect(notificationPrefsSchema.safeParse({ deadline: false, kudos: false }).success).toBe(
      false,
    );
  });

  it("rejects non-boolean values", () => {
    expect(
      notificationPrefsSchema.safeParse({ start: "yes", deadline: false, kudos: false }).success,
    ).toBe(false);
  });
});

describe("unregisterPushSchema", () => {
  it("accepts an https endpoint", () => {
    expect(
      unregisterPushSchema.safeParse({
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      }).success,
    ).toBe(true);
  });

  it("rejects a non-https endpoint", () => {
    expect(
      unregisterPushSchema.safeParse({
        endpoint: "http://attacker.com/push",
      }).success,
    ).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

type SupabaseChainResult = { error: unknown };

const upsert = vi.fn<(...args: unknown[]) => SupabaseChainResult>();
const deleteMatch = vi.fn<(match: object) => Promise<SupabaseChainResult>>();
const deleteEq = vi.fn<(col: string, val: string) => Promise<SupabaseChainResult>>();
const updateEq = vi.fn<(col: string, val: string) => Promise<SupabaseChainResult>>();

const USER_ID = "11111111-1111-1111-1111-111111111111";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: USER_ID, email: "u@test.local" } },
        error: null,
      }),
    },
    from: (table: string) => {
      if (table === "push_subscriptions") {
        return {
          upsert: (...args: unknown[]) => upsert(...args),
          delete: () => ({
            match: (m: object) => deleteMatch(m),
            eq: (col: string, val: string) => deleteEq(col, val),
          }),
        };
      }
      if (table === "users") {
        return {
          update: (patch: object) => ({
            eq: (col: string, val: string) => updateEq(col, val),
            __patch: patch,
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  }),
}));

import {
  clearMyPushSubscriptions,
  registerPushSubscription,
  unregisterPushSubscription,
  updateNotificationPrefs,
} from "./_actions";

beforeEach(() => {
  upsert.mockReset();
  deleteMatch.mockReset();
  deleteEq.mockReset();
  updateEq.mockReset();
});

describe("registerPushSubscription", () => {
  it("rejects a non-https endpoint", async () => {
    upsert.mockResolvedValue({ error: null });
    const res = await registerPushSubscription({
      endpoint: "http://attacker.com/push",
      p256dh: "p",
      auth: "a",
    });
    expect(res.ok).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts a valid subscription keyed by endpoint", async () => {
    upsert.mockResolvedValue({ error: null });
    const res = await registerPushSubscription({
      endpoint: "https://fcm.googleapis.com/fcm/send/ok",
      p256dh: "pk",
      auth: "ak",
    });
    expect(res.ok).toBe(true);
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: USER_ID,
        endpoint: "https://fcm.googleapis.com/fcm/send/ok",
        p256dh: "pk",
        auth: "ak",
      },
      { onConflict: "endpoint" },
    );
  });

  it("maps Supabase forbidden (42501) to failure", async () => {
    upsert.mockResolvedValue({ error: { code: "42501", message: "rls" } });
    const res = await registerPushSubscription({
      endpoint: "https://fcm.googleapis.com/fcm/send/ok",
      p256dh: "pk",
      auth: "ak",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("forbidden");
  });
});

describe("unregisterPushSubscription", () => {
  it("deletes by user_id + endpoint match", async () => {
    deleteMatch.mockResolvedValue({ error: null });
    const res = await unregisterPushSubscription({
      endpoint: "https://fcm.googleapis.com/fcm/send/ok",
    });
    expect(res.ok).toBe(true);
    expect(deleteMatch).toHaveBeenCalledWith({
      user_id: USER_ID,
      endpoint: "https://fcm.googleapis.com/fcm/send/ok",
    });
  });

  it("rejects a non-https endpoint", async () => {
    const res = await unregisterPushSubscription({
      endpoint: "http://x",
    });
    expect(res.ok).toBe(false);
    expect(deleteMatch).not.toHaveBeenCalled();
  });
});

describe("clearMyPushSubscriptions", () => {
  it("deletes all rows owned by the caller", async () => {
    deleteEq.mockResolvedValue({ error: null });
    const res = await clearMyPushSubscriptions();
    expect(res.ok).toBe(true);
    expect(deleteEq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("maps upstream_error when delete fails", async () => {
    deleteEq.mockResolvedValue({ error: { code: "XX000", message: "boom" } });
    const res = await clearMyPushSubscriptions();
    expect(res.ok).toBe(false);
  });
});

describe("updateNotificationPrefs", () => {
  it("updates users.notification_prefs for caller", async () => {
    updateEq.mockResolvedValue({ error: null });
    const res = await updateNotificationPrefs({ start: true, deadline: false });
    expect(res.ok).toBe(true);
    expect(updateEq).toHaveBeenCalledWith("id", USER_ID);
  });

  it("rejects when a key is missing", async () => {
    const res = await updateNotificationPrefs({
      start: true,
    } as unknown as { start: boolean; deadline: boolean });
    expect(res.ok).toBe(false);
    expect(updateEq).not.toHaveBeenCalled();
  });
});

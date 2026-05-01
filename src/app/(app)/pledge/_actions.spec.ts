import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: { id: "11111111-1111-1111-1111-111111111111", email: "u@test.local" },
        },
        error: null,
      }),
    },
    rpc: (name: string, args: unknown) => rpc(name, args),
  }),
}));

const dispatchStartNotification = vi.fn();
vi.mock("@/lib/push/dispatch", () => ({
  dispatchStartNotification: (...args: unknown[]) => dispatchStartNotification(...args),
}));

const trackCalls: Array<{ event: unknown; options: unknown }> = [];
vi.mock("@/lib/analytics/track", () => ({
  track: async (event: unknown, options: unknown) => {
    trackCalls.push({ event, options });
  },
}));

import { signPledge } from "./_actions";

const CHALLENGE = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  rpc.mockReset();
  dispatchStartNotification.mockReset();
  dispatchStartNotification.mockResolvedValue(undefined);
  trackCalls.length = 0;
});

describe("signPledge", () => {
  it("rejects invalid challengeId without hitting Supabase", async () => {
    const res = await signPledge({ challengeId: "not-a-uuid" });
    expect(res.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(dispatchStartNotification).not.toHaveBeenCalled();
  });

  it("returns upstream failure when RPC errors", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom" } });
    const res = await signPledge({ challengeId: CHALLENGE });
    expect(res.ok).toBe(false);
    expect(dispatchStartNotification).not.toHaveBeenCalled();
  });

  it("does not dispatch start notification when status is still pending", async () => {
    rpc.mockResolvedValueOnce({
      data: [{ status: "pending" }],
      error: null,
    });
    const res = await signPledge({ challengeId: CHALLENGE });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.status).toBe("pending");
    expect(dispatchStartNotification).not.toHaveBeenCalled();
  });

  it("dispatches start notification when status transitions to active", async () => {
    rpc.mockResolvedValueOnce({
      data: [{ status: "active" }],
      error: null,
    });
    const res = await signPledge({ challengeId: CHALLENGE });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.status).toBe("active");
    expect(dispatchStartNotification).toHaveBeenCalledWith(CHALLENGE);
  });

  it("returns success immediately even if dispatchStartNotification throws (fire-and-forget)", async () => {
    rpc.mockResolvedValueOnce({
      data: [{ status: "active" }],
      error: null,
    });
    dispatchStartNotification.mockRejectedValueOnce(new Error("push offline"));
    const res = await signPledge({ challengeId: CHALLENGE });
    expect(res.ok).toBe(true);
  });
});

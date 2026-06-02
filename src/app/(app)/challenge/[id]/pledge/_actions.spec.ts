import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({
        data: {
          claims: { sub: "11111111-1111-1111-1111-111111111111", email: "u@test.local" },
        },
        error: null,
      }),
    },
    rpc: (name: string, args: unknown) => rpc(name, args),
  }),
}));

const trackCalls: Array<{ event: unknown; options: unknown }> = [];
vi.mock("@/lib/analytics/track", () => ({
  track: async (event: unknown, options: unknown) => {
    trackCalls.push({ event, options });
  },
}));

const nudgeCalls: Array<[string, string]> = [];
vi.mock("@/lib/push/dispatch", () => ({
  dispatchOwnerStartNudge: async (challengeId: string, ownerUserId: string) => {
    nudgeCalls.push([challengeId, ownerUserId]);
    return { recipientCount: 1, quietHours: false };
  },
}));
// after(cb) 는 request 컨텍스트 의존 — 테스트에서 콜백 즉시 실행.
vi.mock("next/server", () => ({ after: (cb: () => unknown) => cb() }));

import { signPledge } from "./_actions";

const CHALLENGE = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  rpc.mockReset();
  trackCalls.length = 0;
  nudgeCalls.length = 0;
});

describe("signPledge", () => {
  it("rejects invalid challengeId without hitting Supabase", async () => {
    const res = await signPledge({ challengeId: "not-a-uuid" });
    expect(res.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns upstream failure when RPC errors", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom" } });
    const res = await signPledge({ challengeId: CHALLENGE });
    expect(res.ok).toBe(false);
  });

  it("does not dispatch start notification when status is still pending", async () => {
    rpc.mockResolvedValueOnce({
      data: [{ status: "pending", participant_count: 2, challenge_created_at: null }],
      error: null,
    });
    const res = await signPledge({ challengeId: CHALLENGE });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.status).toBe("pending");
      expect(res.data.participantCount).toBe(2);
    }
    // challenge_signed 만 발화, challenge_activated 는 발화 안 함.
    const names = trackCalls.map((c) => (c.event as { name: string }).name);
    expect(names).toEqual(["challenge_signed"]);
  });

  it("does not dispatch activation from signing even when everyone has signed", async () => {
    const createdAt = new Date(Date.now() - 5000).toISOString();
    rpc.mockResolvedValueOnce({
      data: [
        {
          status: "pending",
          participant_count: 3,
          challenge_created_at: createdAt,
        },
      ],
      error: null,
    });
    const res = await signPledge({ challengeId: CHALLENGE });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.status).toBe("pending");
      expect(res.data.participantCount).toBe(3);
    }

    const names = trackCalls.map((c) => (c.event as { name: string }).name);
    expect(names).toEqual(["challenge_signed"]);
  });

  it("멤버가 마지막 서명자(should_nudge_owner=true)면 오너에게 nudge dispatch", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          status: "pending",
          participant_count: 2,
          challenge_created_at: null,
          signed_count: 2,
          owner_user_id: "22222222-2222-4222-8222-222222222222",
          should_nudge_owner: true,
        },
      ],
      error: null,
    });
    const res = await signPledge({ challengeId: CHALLENGE });
    expect(res.ok).toBe(true);
    expect(nudgeCalls).toEqual([[CHALLENGE, "22222222-2222-4222-8222-222222222222"]]);
  });

  it("should_nudge_owner=false 면 nudge dispatch 하지 않음", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          status: "pending",
          participant_count: 2,
          challenge_created_at: null,
          signed_count: 1,
          owner_user_id: "22222222-2222-4222-8222-222222222222",
          should_nudge_owner: false,
        },
      ],
      error: null,
    });
    const res = await signPledge({ challengeId: CHALLENGE });
    expect(res.ok).toBe(true);
    expect(nudgeCalls).toEqual([]);
  });
});

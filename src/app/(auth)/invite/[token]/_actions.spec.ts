import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));

const rpc = vi.fn();
const getClaims = vi.fn();
const maybeSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: () => getClaims() },
    rpc: (name: string, args: unknown) => rpc(name, args),
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () => maybeSingle(),
              }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

const trackCalls: Array<{ event: unknown; options: unknown }> = [];
vi.mock("@/lib/analytics/track", () => ({
  track: async (event: unknown, options: unknown) => {
    trackCalls.push({ event, options });
  },
}));

const fetchNotificationPrefs = vi.fn();
vi.mock("@/lib/db/reads/notification-prefs", () => ({
  fetchNotificationPrefs: (userId: string) => fetchNotificationPrefs(userId),
}));

import { acceptInvite } from "./_actions";

beforeEach(() => {
  rpc.mockReset();
  getClaims.mockReset();
  maybeSingle.mockReset();
  trackCalls.length = 0;
  fetchNotificationPrefs.mockReset();
  // 기본은 알림 ON 상태 — 신규 가입자 / OFF 케이스는 개별 it 에서 override.
  fetchNotificationPrefs.mockResolvedValue({ start: true, deadline: true });
});

describe("acceptInvite", () => {
  it("returns unauthorized when no session (no rpc call)", async () => {
    getClaims.mockResolvedValueOnce({ data: null, error: null });
    const res = await acceptInvite("tok");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("unauthorized");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects empty token", async () => {
    getClaims.mockResolvedValueOnce({
      data: { claims: { sub: "u1", email: "u@test.local" } },
      error: null,
    });
    const res = await acceptInvite("");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_input");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("on success returns groupId and tracks invite_opened", async () => {
    const groupId = "22222222-2222-4222-8222-222222222222";
    getClaims.mockResolvedValueOnce({
      data: { claims: { sub: "u1", email: "u@test.local" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: groupId, error: null });
    maybeSingle.mockResolvedValueOnce({
      data: { id: "33333333-3333-4333-8333-333333333333", status: "pending" },
      error: null,
    });

    const res = await acceptInvite("tok");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.groupId).toBe(groupId);
      expect(res.data.redirectTo).toBe("/challenge/33333333-3333-4333-8333-333333333333/pledge");
    }

    expect(rpc).toHaveBeenCalledWith("accept_invite", { p_token: "tok" });
    expect(trackCalls).toHaveLength(1);
    const ev = trackCalls[0]!.event as { name: string; props: { groupId: string } };
    expect(ev.name).toBe("invite_opened");
    expect(ev.props.groupId).toBe(groupId);
  });

  it("active latest challenge redirects to joined_late detail", async () => {
    const groupId = "22222222-2222-4222-8222-222222222222";
    getClaims.mockResolvedValueOnce({
      data: { claims: { sub: "u1", email: "u@test.local" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: groupId, error: null });
    maybeSingle.mockResolvedValueOnce({
      data: { id: "33333333-3333-4333-8333-333333333333", status: "active" },
      error: null,
    });

    const res = await acceptInvite("tok");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.redirectTo).toBe(
        "/challenge/33333333-3333-4333-8333-333333333333?joined_late=1",
      );
    }
  });

  it("maps 42501 to forbidden (group full or auth edge)", async () => {
    getClaims.mockResolvedValueOnce({
      data: { claims: { sub: "u1", email: "u@test.local" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "group full" },
    });
    const res = await acceptInvite("tok");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("forbidden");
  });

  it("maps P0002 (token missing/expired) to not_found", async () => {
    getClaims.mockResolvedValueOnce({
      data: { claims: { sub: "u1", email: "u@test.local" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0002", message: "expired" },
    });
    const res = await acceptInvite("tok");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("not_found");
  });

  it("sets notifPromptRequired=true when prefs.start is false", async () => {
    const groupId = "22222222-2222-4222-8222-222222222222";
    getClaims.mockResolvedValueOnce({
      data: { claims: { sub: "u1", email: "u@test.local" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: groupId, error: null });
    maybeSingle.mockResolvedValueOnce({
      data: { id: "33333333-3333-4333-8333-333333333333", status: "pending" },
      error: null,
    });
    fetchNotificationPrefs.mockResolvedValueOnce({ start: false, deadline: false });

    const res = await acceptInvite("tok");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.notifPromptRequired).toBe(true);
  });

  it("Phase 5-2: updateTag for my-challenges + home-feed after success", async () => {
    const { updateTag } = await import("next/cache");
    const groupId = "22222222-2222-4222-8222-222222222222";
    const userId = "u1";
    getClaims.mockResolvedValueOnce({
      data: { claims: { sub: userId, email: "u@test.local" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: groupId, error: null });
    maybeSingle.mockResolvedValueOnce({
      data: { id: "33333333-3333-4333-8333-333333333333", status: "pending" },
      error: null,
    });

    await acceptInvite("tok");
    expect(updateTag).toHaveBeenCalledWith(`user-${userId}-my-challenges`);
    expect(updateTag).toHaveBeenCalledWith(`user-${userId}-home-feed`);
  });

  it("sets notifPromptRequired=false when prefs.start is true", async () => {
    const groupId = "22222222-2222-4222-8222-222222222222";
    getClaims.mockResolvedValueOnce({
      data: { claims: { sub: "u1", email: "u@test.local" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: groupId, error: null });
    maybeSingle.mockResolvedValueOnce({
      data: { id: "33333333-3333-4333-8333-333333333333", status: "pending" },
      error: null,
    });
    fetchNotificationPrefs.mockResolvedValueOnce({ start: true, deadline: true });

    const res = await acceptInvite("tok");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.notifPromptRequired).toBe(false);
  });
});

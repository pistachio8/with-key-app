import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
const getUser = vi.fn();
const maybeSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: () => getUser() },
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

import { acceptInvite } from "./_actions";

beforeEach(() => {
  rpc.mockReset();
  getUser.mockReset();
  maybeSingle.mockReset();
  trackCalls.length = 0;
});

describe("acceptInvite", () => {
  it("returns unauthorized when no session (no rpc call)", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await acceptInvite("tok");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("unauthorized");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects empty token", async () => {
    getUser.mockResolvedValueOnce({
      data: { user: { id: "u1", email: "u@test.local" } },
      error: null,
    });
    const res = await acceptInvite("");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_input");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("on success returns groupId and tracks invite_opened", async () => {
    const groupId = "22222222-2222-4222-8222-222222222222";
    getUser.mockResolvedValueOnce({
      data: { user: { id: "u1", email: "u@test.local" } },
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
    getUser.mockResolvedValueOnce({
      data: { user: { id: "u1", email: "u@test.local" } },
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
    getUser.mockResolvedValueOnce({
      data: { user: { id: "u1", email: "u@test.local" } },
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
    getUser.mockResolvedValueOnce({
      data: { user: { id: "u1", email: "u@test.local" } },
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
});

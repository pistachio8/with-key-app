// src/app/(app)/group/[id]/_actions.spec.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const insert = vi.fn();
const singleSelect = vi.fn();
const fromMock = vi.fn(() => ({
  insert: (row: unknown) => {
    insert(row);
    return {
      select: () => ({
        single: singleSelect,
      }),
    };
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "11111111-1111-1111-1111-111111111111" } },
        error: null,
      }),
    },
    from: fromMock,
  }),
}));

const trackCalls: Array<{ event: unknown; options: unknown }> = [];
vi.mock("@/lib/analytics/track", () => ({
  track: async (event: unknown, options: unknown) => {
    trackCalls.push({ event, options });
  },
}));

vi.mock("@/lib/invite/token", () => ({
  generateInviteToken: () => "FIXED_TOKEN_XYZ",
}));

import { createInvite } from "./_actions";

beforeEach(() => {
  insert.mockReset();
  singleSelect.mockReset();
  fromMock.mockClear();
  trackCalls.length = 0;
});

describe("createInvite", () => {
  it("rejects non-uuid groupId before touching Supabase", async () => {
    const res = await createInvite("not-a-uuid");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_input");
    expect(insert).not.toHaveBeenCalled();
  });

  it("inserts invite row with generated token and tracks invite_sent", async () => {
    singleSelect.mockResolvedValueOnce({
      data: { token: "FIXED_TOKEN_XYZ" },
      error: null,
    });
    const groupId = "22222222-2222-4222-8222-222222222222";
    const res = await createInvite(groupId);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.token).toBe("FIXED_TOKEN_XYZ");

    expect(fromMock).toHaveBeenCalledWith("invites");
    expect(insert).toHaveBeenCalledWith({
      group_id: groupId,
      token: "FIXED_TOKEN_XYZ",
      created_by: "11111111-1111-1111-1111-111111111111",
    });
    expect(trackCalls).toHaveLength(1);
    const ev = trackCalls[0]!.event as { name: string; props: { groupId: string } };
    expect(ev.name).toBe("invite_sent");
    expect(ev.props.groupId).toBe(groupId);
  });

  it("maps 42501 to forbidden (non-owner blocked by invites_insert_owner RLS)", async () => {
    singleSelect.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "denied" },
    });
    const res = await createInvite("22222222-2222-4222-8222-222222222222");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("forbidden");
  });

  it("maps 23505 (unique collision on token) to conflict", async () => {
    singleSelect.mockResolvedValueOnce({
      data: null,
      error: { code: "23505", message: "duplicate" },
    });
    const res = await createInvite("22222222-2222-4222-8222-222222222222");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("conflict");
  });
});

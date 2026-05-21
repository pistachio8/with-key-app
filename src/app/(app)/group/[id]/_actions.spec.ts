// src/app/(app)/group/[id]/_actions.spec.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const insert = vi.fn();
const singleSelect = vi.fn();
const groupSelectMaybeSingle = vi.fn();
const groupUpdate = vi.fn();
const groupUpdateMaybeSingle = vi.fn();
const groupDelete = vi.fn();
const groupDeleteResult = vi.fn();
const memberCount = vi.fn();
const challengeCount = vi.fn();

const fromMock = vi.fn((table: string) => {
  if (table === "invites") {
    return {
      insert: (row: unknown) => {
        insert(row);
        return {
          select: () => ({
            single: singleSelect,
          }),
        };
      },
    };
  }

  if (table === "groups") {
    return {
      select: () => ({
        eq: () => ({ maybeSingle: groupSelectMaybeSingle }),
      }),
      update: (row: unknown) => {
        groupUpdate(row);
        return {
          eq: () => ({
            eq: () => ({
              select: () => ({ maybeSingle: groupUpdateMaybeSingle }),
            }),
          }),
        };
      },
      delete: () => {
        groupDelete();
        return {
          eq: () => ({
            eq: () => groupDeleteResult(),
          }),
        };
      },
    };
  }

  if (table === "group_members") {
    return {
      select: () => ({
        eq: () => memberCount(),
      }),
    };
  }

  if (table === "challenges") {
    return {
      select: () => ({
        eq: () => challengeCount(),
      }),
    };
  }

  throw new Error(`unexpected from(${table})`);
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
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

import { createInvite, deleteGroup, renameGroup } from "./_actions";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const GROUP_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  insert.mockReset();
  singleSelect.mockReset();
  groupSelectMaybeSingle.mockReset();
  groupUpdate.mockReset();
  groupUpdateMaybeSingle.mockReset();
  groupDelete.mockReset();
  groupDeleteResult.mockReset();
  memberCount.mockReset();
  challengeCount.mockReset();
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
    const res = await createInvite(GROUP_ID);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.token).toBe("FIXED_TOKEN_XYZ");

    expect(fromMock).toHaveBeenCalledWith("invites");
    expect(insert).toHaveBeenCalledWith({
      group_id: GROUP_ID,
      token: "FIXED_TOKEN_XYZ",
      created_by: OWNER_ID,
    });
    expect(trackCalls).toHaveLength(1);
    const ev = trackCalls[0]!.event as { name: string; props: { groupId: string } };
    expect(ev.name).toBe("invite_sent");
    expect(ev.props.groupId).toBe(GROUP_ID);
  });

  it("maps 42501 to forbidden (non-owner blocked by invites_insert_owner RLS)", async () => {
    singleSelect.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "denied" },
    });
    const res = await createInvite(GROUP_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("forbidden");
  });

  it("maps 23505 (unique collision on token) to conflict", async () => {
    singleSelect.mockResolvedValueOnce({
      data: null,
      error: { code: "23505", message: "duplicate" },
    });
    const res = await createInvite(GROUP_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("conflict");
  });
});

describe("renameGroup", () => {
  it("rejects blank name before touching Supabase", async () => {
    const res = await renameGroup({ groupId: GROUP_ID, name: " " });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_input");
    expect(groupUpdate).not.toHaveBeenCalled();
  });

  it("updates the group name for the owner", async () => {
    groupUpdateMaybeSingle.mockResolvedValueOnce({
      data: { id: GROUP_ID, name: "러닝 크루" },
      error: null,
    });

    const res = await renameGroup({ groupId: GROUP_ID, name: "  러닝 크루  " });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.name).toBe("러닝 크루");
    expect(groupUpdate).toHaveBeenCalledWith({ name: "러닝 크루" });
  });

  it("returns forbidden when no owner-owned row is updated", async () => {
    groupUpdateMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await renameGroup({ groupId: GROUP_ID, name: "러닝 크루" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("forbidden");
  });
});

describe("deleteGroup", () => {
  it("rejects non-uuid groupId before touching Supabase", async () => {
    const res = await deleteGroup("not-a-uuid");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_input");
    expect(groupDelete).not.toHaveBeenCalled();
  });

  it("rejects non-owner groups", async () => {
    groupSelectMaybeSingle.mockResolvedValueOnce({
      data: { id: GROUP_ID, owner_id: "99999999-9999-4999-8999-999999999999" },
      error: null,
    });

    const res = await deleteGroup(GROUP_ID);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("forbidden");
    expect(groupDelete).not.toHaveBeenCalled();
  });

  it("rejects groups with two or more members", async () => {
    groupSelectMaybeSingle.mockResolvedValueOnce({
      data: { id: GROUP_ID, owner_id: OWNER_ID },
      error: null,
    });
    memberCount.mockResolvedValueOnce({ count: 2, error: null });

    const res = await deleteGroup(GROUP_ID);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("invalid_input");
      expect(res.issues?.groupId?.[0]).toBe("친구와 함께한 그룹은 삭제할 수 없어요");
    }
    expect(challengeCount).not.toHaveBeenCalled();
    expect(groupDelete).not.toHaveBeenCalled();
  });

  it("rejects groups with any challenge history", async () => {
    groupSelectMaybeSingle.mockResolvedValueOnce({
      data: { id: GROUP_ID, owner_id: OWNER_ID },
      error: null,
    });
    memberCount.mockResolvedValueOnce({ count: 1, error: null });
    challengeCount.mockResolvedValueOnce({ count: 1, error: null });

    const res = await deleteGroup(GROUP_ID);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("invalid_input");
      expect(res.issues?.groupId?.[0]).toBe("한 번이라도 챌린지를 시작한 그룹은 삭제할 수 없어요");
    }
    expect(groupDelete).not.toHaveBeenCalled();
  });

  it("deletes owner single-member groups with zero challenges", async () => {
    groupSelectMaybeSingle.mockResolvedValueOnce({
      data: { id: GROUP_ID, owner_id: OWNER_ID },
      error: null,
    });
    memberCount.mockResolvedValueOnce({ count: 1, error: null });
    challengeCount.mockResolvedValueOnce({ count: 0, error: null });
    groupDeleteResult.mockResolvedValueOnce({ error: null });

    const res = await deleteGroup(GROUP_ID);

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.id).toBe(GROUP_ID);
    expect(groupDelete).toHaveBeenCalledTimes(1);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
const getUser = vi.fn();
const inviteInsert = vi.fn();
const usersSelect = vi.fn();
const readOwnerGroupsForChallengeForm = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: () => getUser() },
    rpc: (name: string, args: unknown) => rpc(name, args),
    from: (table: string) => {
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => usersSelect() }),
          }),
        };
      }
      if (table === "invites") {
        return { insert: (row: unknown) => inviteInsert(row) };
      }
      throw new Error(`unexpected from(${table})`);
    },
  }),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (key: string) => {
      if (key === "host") return "with-key.test";
      if (key === "x-forwarded-proto") return "https";
      return null;
    },
  }),
}));

vi.mock("@/lib/db/reads/owner-groups-for-challenge-form", () => ({
  readOwnerGroupsForChallengeForm: (_supabase: unknown, ownerId: string) =>
    readOwnerGroupsForChallengeForm(ownerId),
}));

const trackCalls: Array<{ event: { name: string; props: Record<string, unknown> } }> = [];
vi.mock("@/lib/analytics/track", () => ({
  track: async (event: unknown) => {
    trackCalls.push({ event: event as never });
  },
}));

import { createChallenge } from "./_actions";

const GROUP_ID = "11111111-1111-4111-8111-111111111111";
const CHALLENGE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

const validInput = {
  groupId: GROUP_ID,
  title: "주 3회 운동",
  type: "fitness" as const,
  goalCount: 3,
  durationDays: 7,
  penaltyAmount: 5000,
};

function authedUser() {
  getUser.mockResolvedValueOnce({
    data: { user: { id: USER_ID, email: "u@test.local" } },
    error: null,
  });
}

beforeEach(() => {
  rpc.mockReset();
  getUser.mockReset();
  inviteInsert.mockReset();
  usersSelect.mockReset();
  readOwnerGroupsForChallengeForm.mockReset();
  trackCalls.length = 0;
});

describe("createChallenge", () => {
  it("unauthorized — no session", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await createChallenge(validInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("unauthorized");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("invalid_input — empty title", async () => {
    authedUser();
    const res = await createChallenge({ ...validInput, title: "" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_input");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("invalid_input — durationDays < 7 (ADR-0004)", async () => {
    authedUser();
    const res = await createChallenge({ ...validInput, durationDays: 3 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_input");
  });

  it("groupId 제공 + signature 없음 → create_challenge + invites insert", async () => {
    authedUser();
    rpc.mockResolvedValueOnce({
      data: [{ id: CHALLENGE_ID, participant_count: 1 }],
      error: null,
    });
    inviteInsert.mockResolvedValueOnce({ error: null });

    const res = await createChallenge(validInput);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.id).toBe(CHALLENGE_ID);
      expect(res.data.inviteUrl).toMatch(/^https:\/\/with-key\.test\/invite\//);
    }
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("create_challenge", expect.any(Object));
    expect(inviteInsert).toHaveBeenCalledTimes(1);

    const created = trackCalls.find((c) => c.event.name === "challenge_created");
    expect(created?.event.props.challengeId).toBe(CHALLENGE_ID);
    const inviteSent = trackCalls.find((c) => c.event.name === "invite_sent");
    expect(inviteSent).toBeTruthy();
  });

  it("ownerSignatureDataUrl 있음 → sign_and_maybe_activate 호출", async () => {
    authedUser();
    rpc.mockResolvedValueOnce({
      data: [{ id: CHALLENGE_ID, participant_count: 1 }],
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: [{ status: "pending" }], error: null });
    inviteInsert.mockResolvedValueOnce({ error: null });

    const res = await createChallenge({
      ...validInput,
      ownerSignatureDataUrl: "data:image/png;base64,AAA",
    });
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenNthCalledWith(2, "sign_and_maybe_activate", {
      p_challenge_id: CHALLENGE_ID,
    });
    const signed = trackCalls.find((c) => c.event.name === "challenge_signed");
    expect(signed).toBeTruthy();
  });

  it("groupId 미제공 + owner 그룹 0개 → create_group_with_owner RPC 호출", async () => {
    authedUser();
    readOwnerGroupsForChallengeForm.mockResolvedValueOnce({ ok: true, groups: [] });
    usersSelect.mockResolvedValueOnce({ data: { display_name: "민지" }, error: null });
    rpc.mockResolvedValueOnce({ data: GROUP_ID, error: null });
    rpc.mockResolvedValueOnce({
      data: [{ id: CHALLENGE_ID, participant_count: 1 }],
      error: null,
    });
    inviteInsert.mockResolvedValueOnce({ error: null });

    const res = await createChallenge({ ...validInput, groupId: undefined });
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "create_group_with_owner",
      expect.objectContaining({ p_name: "민지님과 친구들" }),
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "create_challenge",
      expect.objectContaining({ p_group_id: GROUP_ID }),
    );
    const groupCreated = trackCalls.find((c) => c.event.name === "group_created");
    expect(groupCreated?.event.props.hasAccount).toBe(false);
  });

  it("groupId 미제공 + owner 그룹 1개 → 기존 그룹에 자동 attach", async () => {
    authedUser();
    readOwnerGroupsForChallengeForm.mockResolvedValueOnce({
      ok: true,
      groups: [
        {
          id: GROUP_ID,
          name: "러닝 크루",
          createdAt: "2026-05-20T00:00:00.000Z",
          latestChallengeCreatedAt: "2026-05-20T09:00:00.000Z",
        },
      ],
    });
    rpc.mockResolvedValueOnce({
      data: [{ id: CHALLENGE_ID, participant_count: 1 }],
      error: null,
    });
    inviteInsert.mockResolvedValueOnce({ error: null });

    const res = await createChallenge({ ...validInput, groupId: undefined });
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "create_challenge",
      expect.objectContaining({ p_group_id: GROUP_ID }),
    );
    expect(usersSelect).not.toHaveBeenCalled();
    expect(trackCalls.find((c) => c.event.name === "group_created")).toBeUndefined();
  });

  it("groupId 미제공 + owner 그룹 2개 이상 → 서버에서 groupId 선택을 강제", async () => {
    authedUser();
    readOwnerGroupsForChallengeForm.mockResolvedValueOnce({
      ok: true,
      groups: [
        {
          id: GROUP_ID,
          name: "러닝 크루",
          createdAt: "2026-05-20T00:00:00.000Z",
          latestChallengeCreatedAt: null,
        },
        {
          id: "44444444-4444-4444-8444-444444444444",
          name: "헬스 메이트",
          createdAt: "2026-05-21T00:00:00.000Z",
          latestChallengeCreatedAt: null,
        },
      ],
    });

    const res = await createChallenge({ ...validInput, groupId: undefined });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("invalid_input");
      expect(res.issues?.groupId?.[0]).toBe("그룹을 선택해 주세요");
    }
    expect(rpc).not.toHaveBeenCalled();
    expect(inviteInsert).not.toHaveBeenCalled();
  });

  it("owner 그룹 read 실패 → upstream_error", async () => {
    authedUser();
    readOwnerGroupsForChallengeForm.mockResolvedValueOnce({ ok: false, groups: [], error: {} });

    const res = await createChallenge({ ...validInput, groupId: undefined });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("upstream_error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("create_challenge 42501 → forbidden", async () => {
    authedUser();
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "not group owner" },
    });
    const res = await createChallenge(validInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("forbidden");
  });

  it("create_challenge P0002 → not_found", async () => {
    authedUser();
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0002", message: "group not found" },
    });
    const res = await createChallenge(validInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("not_found");
  });
});

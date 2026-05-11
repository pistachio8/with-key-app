import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: () => getUser() },
    rpc: (name: string, args: unknown) => rpc(name, args),
  }),
}));

const trackCalls: Array<{ event: unknown; options: unknown }> = [];
vi.mock("@/lib/analytics/track", () => ({
  track: async (event: unknown, options: unknown) => {
    trackCalls.push({ event, options });
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
  trackCalls.length = 0;
});

describe("createChallenge", () => {
  it("returns unauthorized when no session (no rpc call)", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await createChallenge(validInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("unauthorized");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns invalid_input on schema violation (empty title)", async () => {
    authedUser();
    const res = await createChallenge({ ...validInput, title: "" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_input");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("on success returns id, calls create_challenge RPC, tracks challenge_created", async () => {
    authedUser();
    rpc.mockResolvedValueOnce({
      data: [{ id: CHALLENGE_ID, participant_count: 1 }],
      error: null,
    });

    const res = await createChallenge(validInput);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.id).toBe(CHALLENGE_ID);

    expect(rpc).toHaveBeenCalledWith("create_challenge", {
      p_group_id: GROUP_ID,
      p_title: validInput.title,
      p_type: validInput.type,
      p_goal_count: validInput.goalCount,
      p_duration_days: validInput.durationDays,
      p_penalty_amount: validInput.penaltyAmount,
    });

    expect(trackCalls).toHaveLength(1);
    const ev = trackCalls[0]!.event as {
      name: string;
      props: { challengeId: string; penaltyAmount: number; goalCount: number };
    };
    expect(ev.name).toBe("challenge_created");
    expect(ev.props.challengeId).toBe(CHALLENGE_ID);
    expect(ev.props.penaltyAmount).toBe(5000);
    expect(ev.props.goalCount).toBe(3);
  });

  it("maps 42501 to forbidden (not group owner)", async () => {
    authedUser();
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "not group owner" },
    });
    const res = await createChallenge(validInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("forbidden");
    expect(trackCalls).toHaveLength(0);
  });

  it("maps P0002 (group not found) to not_found", async () => {
    authedUser();
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0002", message: "group not found" },
    });
    const res = await createChallenge(validInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("not_found");
  });

  it("maps 23514 (check constraint) to invalid_input", async () => {
    authedUser();
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "23514", message: "check failed" },
    });
    const res = await createChallenge(validInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_input");
  });
});

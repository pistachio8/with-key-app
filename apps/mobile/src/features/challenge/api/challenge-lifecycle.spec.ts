// RN 챌린지 lifecycle mutation 단위 테스트 (EVAL-0018) — RPC 계약
// (0021/0022 create_challenge · 0040 sign_and_maybe_activate · 0039 start)의
// 파라미터 매핑·에러 코드 매핑(42501/P0002/23505)·결과 정규화를 검증한다.
// 미인가(42501) 경로는 SECURITY DEFINER RPC 가 거부하는 계약을 클라이언트가
// forbidden 으로 표면화하는지 본다 — 실 RLS 실측은 dev-build 수동 스모크(핸드오프).
const mockRpc = jest.fn();
const mockMaybeSingle = jest.fn();

type MockQueryChain = {
  select: jest.Mock;
  eq: jest.Mock;
  maybeSingle: () => unknown;
};

const mockQueryChain: MockQueryChain = {
  select: jest.fn(() => mockQueryChain),
  eq: jest.fn(() => mockQueryChain),
  maybeSingle: () => mockMaybeSingle(),
};

jest.mock("@/services/supabase/client", () => ({
  getSupabaseClient: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: jest.fn(() => mockQueryChain),
  }),
}));

const mockFetchOwnerGroups = jest.fn();

jest.mock("./challenge-reads", () => ({
  fetchOwnerGroupsForChallengeForm: (...args: unknown[]) => mockFetchOwnerGroups(...args),
}));

// eslint-disable-next-line import/first -- jest.mock 은 babel 이 hoist 하므로 모킹 선언을 위에 둔다
import {
  createChallenge,
  signPledge,
  startChallengeWithSignedParticipants,
} from "./challenge-lifecycle";

const USER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const GROUP_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const CHALLENGE_ID = "11111111-2222-4333-8444-555555555555";

const VALID_INPUT = {
  groupId: GROUP_ID,
  title: "이번 주 운동 서약서",
  type: "fitness" as const,
  goalCount: 7,
  durationDays: 7,
  penaltyAmount: 3000,
  ownerSigned: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("createChallenge", () => {
  it("create_challenge RPC 에 p_* 파라미터를 매핑하고 ownerSigned 면 자가 서명까지 잇는다", async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === "create_challenge") {
        return Promise.resolve({
          data: [{ id: CHALLENGE_ID, participant_count: 3 }],
          error: null,
        });
      }
      if (fn === "sign_and_maybe_activate") {
        return Promise.resolve({ data: [{ status: "pending" }], error: null });
      }
      throw new Error(`unexpected rpc: ${fn}`);
    });

    const result = await createChallenge(USER_ID, VALID_INPUT);

    expect(mockRpc).toHaveBeenCalledWith("create_challenge", {
      p_group_id: GROUP_ID,
      p_title: "이번 주 운동 서약서",
      p_type: "fitness",
      p_goal_count: 7,
      p_duration_days: 7,
      p_penalty_amount: 3000,
    });
    expect(mockRpc).toHaveBeenCalledWith("sign_and_maybe_activate", {
      p_challenge_id: CHALLENGE_ID,
    });
    expect(result).toEqual({
      ok: true,
      challengeId: CHALLENGE_ID,
      groupId: GROUP_ID,
      participantCount: 3,
    });
  });

  it("ownerSigned=false 면 자가 서명 RPC 를 호출하지 않는다", async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: CHALLENGE_ID, participant_count: 1 }],
      error: null,
    });

    const result = await createChallenge(USER_ID, { ...VALID_INPUT, ownerSigned: false });

    expect(result.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).not.toHaveBeenCalledWith("sign_and_maybe_activate", expect.anything());
  });

  it("zod 검증 실패(기간 7일 미만)는 invalid_input — RPC 미호출", async () => {
    const result = await createChallenge(USER_ID, { ...VALID_INPUT, durationDays: 3 });

    expect(result).toEqual({ ok: false, error: "invalid_input" });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("groupId 미지정 + owner 그룹 0개면 create_group_with_owner 로 신규 그룹을 만든다 (ADR-0012)", async () => {
    mockFetchOwnerGroups.mockResolvedValue([]);
    mockMaybeSingle.mockResolvedValue({ data: { display_name: "민지" }, error: null });
    mockRpc.mockImplementation((fn: string) => {
      if (fn === "create_group_with_owner") {
        return Promise.resolve({ data: GROUP_ID, error: null });
      }
      if (fn === "create_challenge") {
        return Promise.resolve({
          data: [{ id: CHALLENGE_ID, participant_count: 1 }],
          error: null,
        });
      }
      throw new Error(`unexpected rpc: ${fn}`);
    });

    const result = await createChallenge(USER_ID, {
      ...VALID_INPUT,
      groupId: undefined,
      ownerSigned: false,
    });

    expect(mockRpc).toHaveBeenCalledWith("create_group_with_owner", {
      p_name: "민지님과 친구들",
      p_bank_code: null,
      p_account_holder: null,
      p_account_number_encrypted: null,
      p_account_number_last4: null,
    });
    expect(result).toEqual({
      ok: true,
      challengeId: CHALLENGE_ID,
      groupId: GROUP_ID,
      participantCount: 1,
    });
  });

  it("groupId 미지정 + owner 그룹 2개 이상이면 group_selection_required", async () => {
    mockFetchOwnerGroups.mockResolvedValue([
      {
        id: "g1",
        name: "그룹1",
        createdAt: "",
        latestChallengeCreatedAt: null,
        openChallengeId: null,
      },
      {
        id: "g2",
        name: "그룹2",
        createdAt: "",
        latestChallengeCreatedAt: null,
        openChallengeId: null,
      },
    ]);

    const result = await createChallenge(USER_ID, { ...VALID_INPUT, groupId: undefined });

    expect(result).toEqual({ ok: false, error: "group_selection_required" });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("42501(비owner — RPC 권한 거부)은 forbidden 으로 표면화한다", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "not group owner" },
    });

    expect(await createChallenge(USER_ID, VALID_INPUT)).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("23505(그룹당 open 챌린지 1개 — 0029)는 conflict", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "challenges_one_open_per_group" },
    });

    expect(await createChallenge(USER_ID, VALID_INPUT)).toEqual({ ok: false, error: "conflict" });
  });
});

describe("signPledge", () => {
  it("sign_and_maybe_activate RPC 를 호출하고 서명 현황을 정규화한다", async () => {
    mockRpc.mockResolvedValue({
      data: [{ status: "pending", participant_count: 3, signed_count: 2 }],
      error: null,
    });

    const result = await signPledge(CHALLENGE_ID);

    expect(mockRpc).toHaveBeenCalledWith("sign_and_maybe_activate", {
      p_challenge_id: CHALLENGE_ID,
    });
    expect(result).toEqual({
      ok: true,
      challengeId: CHALLENGE_ID,
      status: "pending",
      participantCount: 3,
      signedCount: 2,
    });
  });

  it("이미 서명한 재호출도 성공으로 수렴한다 (RPC coalesce — 멱등)", async () => {
    mockRpc.mockResolvedValue({
      data: [{ status: "pending", participant_count: 3, signed_count: 2 }],
      error: null,
    });

    expect((await signPledge(CHALLENGE_ID)).ok).toBe(true);
    expect((await signPledge(CHALLENGE_ID)).ok).toBe(true);
  });

  it("42501(비참가자/시작된 챌린지)은 forbidden — pending freeze 보존", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "not a participant" },
    });

    expect(await signPledge(CHALLENGE_ID)).toEqual({ ok: false, error: "forbidden" });
  });

  it("uuid 가 아닌 challengeId 는 invalid_input — RPC 미호출", async () => {
    expect(await signPledge("not-a-uuid")).toEqual({ ok: false, error: "invalid_input" });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("startChallengeWithSignedParticipants", () => {
  it("owner start — active 전환 row 를 정규화해 반환한다", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          status: "active",
          start_at: "2026-06-12T01:00:00Z",
          end_at: "2026-06-19T15:00:00Z",
          participant_count: 2,
        },
      ],
      error: null,
    });

    const result = await startChallengeWithSignedParticipants(CHALLENGE_ID);

    expect(mockRpc).toHaveBeenCalledWith("start_challenge_with_signed_participants", {
      p_challenge_id: CHALLENGE_ID,
    });
    expect(result).toEqual({
      ok: true,
      challengeId: CHALLENGE_ID,
      participantCount: 2,
      startAt: "2026-06-12T01:00:00Z",
      endAt: "2026-06-19T15:00:00Z",
    });
  });

  it("42501(비owner 또는 owner 미서명)은 forbidden", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "not challenge owner or not startable" },
    });

    expect(await startChallengeWithSignedParticipants(CHALLENGE_ID)).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("active 전환이 확인되지 않으면 성공으로 보고하지 않는다", async () => {
    mockRpc.mockResolvedValue({
      data: [{ status: "pending", start_at: null, end_at: null, participant_count: 2 }],
      error: null,
    });

    expect(await startChallengeWithSignedParticipants(CHALLENGE_ID)).toEqual({
      ok: false,
      error: "mutation_failed",
    });
  });
});

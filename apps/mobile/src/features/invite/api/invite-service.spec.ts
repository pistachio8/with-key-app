// RN invite 수락 service 단위 테스트 (EVAL-0013) — accept_invite RPC semantics
// (0028: P0002=만료/없음 · 42501=꽉참 · already-joined=성공) 매핑과 착지 분기를 검증한다.
const mockRpc = jest.fn();
const mockMaybeSingle = jest.fn();

type MockQueryChain = {
  select: jest.Mock;
  eq: jest.Mock;
  in: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  maybeSingle: () => unknown;
};

const mockQueryChain: MockQueryChain = {
  select: jest.fn(() => mockQueryChain),
  eq: jest.fn(() => mockQueryChain),
  in: jest.fn(() => mockQueryChain),
  order: jest.fn(() => mockQueryChain),
  limit: jest.fn(() => mockQueryChain),
  maybeSingle: () => mockMaybeSingle(),
};

jest.mock("@/services/supabase/client", () => ({
  getSupabaseClient: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: jest.fn(() => mockQueryChain),
  }),
}));

// eslint-disable-next-line import/first -- jest.mock 은 babel 이 hoist 하므로 모킹 선언을 위에 둔다
import { acceptInvite } from "./invite-service";

const GROUP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const CHALLENGE_ID = "11111111-2222-4333-8444-555555555555";

describe("acceptInvite", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("token 을 accept_invite RPC 에 전달한다", async () => {
    mockRpc.mockResolvedValue({ data: GROUP_ID, error: null });
    mockMaybeSingle.mockResolvedValue({ data: null });

    await acceptInvite("invite-token-abc");

    expect(mockRpc).toHaveBeenCalledWith("accept_invite", { p_token: "invite-token-abc" });
  });

  it("pending 챌린지가 있으면 서약(pledge) 착지를 돌려준다", async () => {
    mockRpc.mockResolvedValue({ data: GROUP_ID, error: null });
    mockMaybeSingle.mockResolvedValue({ data: { id: CHALLENGE_ID, status: "pending" } });

    const result = await acceptInvite("invite-token-abc");

    expect(result).toEqual({
      ok: true,
      groupId: GROUP_ID,
      redirect: { kind: "pledge", challengeId: CHALLENGE_ID },
    });
  });

  it("active 챌린지만 있으면 챌린지 상세 착지 (다음 챌린지부터 합류 — 0028 freeze)", async () => {
    mockRpc.mockResolvedValue({ data: GROUP_ID, error: null });
    mockMaybeSingle.mockResolvedValue({ data: { id: CHALLENGE_ID, status: "active" } });

    const result = await acceptInvite("invite-token-abc");

    expect(result).toEqual({
      ok: true,
      groupId: GROUP_ID,
      redirect: { kind: "challenge", challengeId: CHALLENGE_ID },
    });
  });

  it("진행 중 챌린지가 없으면 홈 착지", async () => {
    mockRpc.mockResolvedValue({ data: GROUP_ID, error: null });
    mockMaybeSingle.mockResolvedValue({ data: null });

    const result = await acceptInvite("invite-token-abc");

    expect(result).toEqual({ ok: true, groupId: GROUP_ID, redirect: { kind: "home" } });
  });

  it("P0002(없음/만료) 는 invalid_or_expired — 존재 여부를 가르지 않는다", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "P0002", message: "invite expired" },
    });

    expect(await acceptInvite("invite-token-abc")).toEqual({
      ok: false,
      error: "invalid_or_expired",
    });
  });

  it("42501 'group full' 은 group_full (PRD §3.3 AC-4 5명째 차단)", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "group full" },
    });

    expect(await acceptInvite("invite-token-abc")).toEqual({ ok: false, error: "group_full" });
  });

  it("그 외 42501(auth 등) 과 일반 오류는 accept_failed", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "auth required" },
    });
    expect(await acceptInvite("invite-token-abc")).toEqual({ ok: false, error: "accept_failed" });

    mockRpc.mockResolvedValue({ data: null, error: { code: "08000", message: "boom" } });
    expect(await acceptInvite("invite-token-abc")).toEqual({ ok: false, error: "accept_failed" });
  });

  it("RPC 응답이 uuid 문자열이 아니면 accept_failed", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    expect(await acceptInvite("invite-token-abc")).toEqual({ ok: false, error: "accept_failed" });
  });
});

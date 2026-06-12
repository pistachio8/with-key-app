// BFF fetch 전송 계층 — Bearer 헤더·base URL 폴백·에러 매핑 검증 (ADR-0036 §1 · EVAL-0016).
const mockGetSession = jest.fn();

jest.mock("@/services/supabase/client", () => ({
  getSupabaseClient: () => ({ auth: { getSession: mockGetSession } }),
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { appVariant: "dev", universalLinkDomain: "dev.fromwith.app" },
    },
  },
}));

// eslint-disable-next-line import/first -- jest.mock 은 babel 이 hoist 하므로 모킹 선언을 위에 둔다
import { BffRequestError, bffGetJson } from "./bff-client";

const mockFetch = jest.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

afterEach(() => {
  jest.clearAllMocks();
});

describe("bffGetJson", () => {
  it("세션 access token 을 Authorization: Bearer 로 보낸다 — universal link 도메인 폴백", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "token-1" } },
      error: null,
    });
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

    await expect(bffGetJson("/api/feed?challengeId=c1")).resolves.toEqual([]);
    expect(mockFetch).toHaveBeenCalledWith("https://dev.fromwith.app/api/feed?challengeId=c1", {
      headers: { Authorization: "Bearer token-1" },
    });
  });

  it("세션이 없으면 401 BffRequestError — 비로그인 요청이 BFF 에 나가지 않는다", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(bffGetJson("/api/feed")).rejects.toMatchObject({ status: 401 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("!ok 응답은 status 를 보존한 BffRequestError 로 던진다", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "token-1" } },
      error: null,
    });
    mockFetch.mockResolvedValue({ ok: false, status: 403 });

    await expect(bffGetJson("/api/feed")).rejects.toBeInstanceOf(BffRequestError);
    await expect(bffGetJson("/api/feed")).rejects.toMatchObject({ status: 403 });
  });
});

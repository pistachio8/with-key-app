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
import { BffRequestError, bffGetJson, bffPostFormData } from "./bff-client";

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

describe("bffPostFormData (D-7 status→동작 계약)", () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "token-1" } },
      error: null,
    });
  });

  it("FormData 를 POST 하고 Authorization Bearer 를 보낸다 (Content-Type 자동)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true }),
    });
    const fd = new FormData();

    await bffPostFormData("/api/action-log", fd);

    expect(mockFetch).toHaveBeenCalledWith("https://dev.fromwith.app/api/action-log", {
      method: "POST",
      headers: { Authorization: "Bearer token-1" },
      body: fd,
      signal: expect.anything(),
    });
  });

  it("200 JSON 봉투를 값으로 반환한다", async () => {
    const envelope = { ok: true, data: { id: "log-1" } };
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(envelope) });

    await expect(bffPostFormData("/api/action-log", new FormData())).resolves.toEqual(envelope);
  });

  it("4xx 라도 JSON 봉투면 값으로 반환한다 — throw 아님", async () => {
    const envelope = { ok: false, error: "invalid_input", issues: { photo: ["required"] } };
    mockFetch.mockResolvedValue({ ok: false, status: 422, json: () => Promise.resolve(envelope) });

    await expect(bffPostFormData("/api/action-log", new FormData())).resolves.toEqual(envelope);
  });

  it("401 봉투도 값으로 반환한다 (route 가 unauthorized 봉투를 줌)", async () => {
    const envelope = { ok: false, error: "unauthorized" };
    mockFetch.mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve(envelope) });

    await expect(bffPostFormData("/api/action-log", new FormData())).resolves.toEqual(envelope);
  });

  it("세션이 없으면 401 BffRequestError — fetch 미호출", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(bffPostFormData("/api/action-log", new FormData())).rejects.toMatchObject({
      status: 401,
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("JSON parse 실패(빈 body 5xx)는 status 보존 BffRequestError", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("Unexpected end of JSON input")),
    });

    await expect(bffPostFormData("/api/action-log", new FormData())).rejects.toMatchObject({
      status: 500,
    });
  });

  it("5xx 라도 upstream_error 봉투가 실리면 값으로 반환한다 (빈 body 5xx 와 분기)", async () => {
    const envelope = { ok: false, error: "upstream_error" };
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.resolve(envelope),
    });

    await expect(bffPostFormData("/api/action-log", new FormData())).resolves.toEqual(envelope);
  });

  it("비객체 body 는 BffRequestError", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(null) });

    await expect(bffPostFormData("/api/action-log", new FormData())).rejects.toBeInstanceOf(
      BffRequestError,
    );
  });

  it("네트워크 오류는 status 0 BffRequestError", async () => {
    mockFetch.mockRejectedValue(new TypeError("Network request failed"));

    await expect(bffPostFormData("/api/action-log", new FormData())).rejects.toMatchObject({
      status: 0,
    });
  });
});

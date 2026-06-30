// RN authService 단위 테스트 (EVAL-0012) — Kakao id token 경로·magic link redirect·
// logout 계약을 supabase/Kakao 모킹으로 검증한다.
const mockKakaoLogin = jest.fn();
const mockKakaoLogout = jest.fn();
const mockSignInWithIdToken = jest.fn();
const mockSignInWithOtp = jest.fn();
const mockVerifyOtp = jest.fn();
const mockSignOut = jest.fn();
const mockGetSession = jest.fn();
const mockUnregisterPushToken = jest.fn();

jest.mock("@/capabilities/kakao-auth", () => ({
  kakaoAuth: {
    init: jest.fn(),
    login: (...args: unknown[]) => mockKakaoLogin(...args),
    logout: (...args: unknown[]) => mockKakaoLogout(...args),
  },
}));

jest.mock("@/capabilities/push-notification", () => ({
  unregisterPushToken: (...args: unknown[]) => mockUnregisterPushToken(...args),
}));

jest.mock("@/services/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      signInWithIdToken: mockSignInWithIdToken,
      signInWithOtp: mockSignInWithOtp,
      verifyOtp: mockVerifyOtp,
      signOut: mockSignOut,
      getSession: mockGetSession,
    },
  }),
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
import { requestMagicLink, signInWithKakao, signOut, verifyMagicLinkToken } from "./auth-service";

describe("signInWithKakao", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("id token 을 signInWithIdToken 에 전달한다 (ADR-0034 결정 1)", async () => {
    mockKakaoLogin.mockResolvedValue({ idToken: "kakao-id-token", accessToken: "kakao-access" });
    mockSignInWithIdToken.mockResolvedValue({ error: null });

    const result = await signInWithKakao();

    expect(result).toEqual({ ok: true });
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({
      provider: "kakao",
      token: "kakao-id-token",
      access_token: "kakao-access",
    });
  });

  it("id token 이 없으면 (OIDC 미활성) 명시 에러 코드를 돌려준다", async () => {
    mockKakaoLogin.mockResolvedValue({ idToken: null, accessToken: "kakao-access" });

    const result = await signInWithKakao();

    expect(result).toEqual({ ok: false, error: "kakao_no_id_token" });
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it("카카오 로그인 취소/실패 시 supabase 호출 없이 실패한다", async () => {
    mockKakaoLogin.mockRejectedValue(new Error("user cancelled"));

    const result = await signInWithKakao();

    expect(result).toEqual({ ok: false, error: "kakao_cancelled" });
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it("supabase 교환 실패 시 auth_failed", async () => {
    mockKakaoLogin.mockResolvedValue({ idToken: "t", accessToken: "a" });
    mockSignInWithIdToken.mockResolvedValue({ error: { message: "bad id token" } });

    expect(await signInWithKakao()).toEqual({ ok: false, error: "auth_failed" });
  });
});

describe("requestMagicLink", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("emailRedirectTo 는 universal link 다 (ADR-0034 결정 2 — custom scheme 금지)", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });

    const result = await requestMagicLink("user@example.com");

    expect(result).toEqual({ ok: true });
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      options: { emailRedirectTo: "https://dev.fromwith.app/auth/callback" },
    });
  });

  it("이메일 형식 오류는 전송 없이 실패한다", async () => {
    expect(await requestMagicLink("not-an-email")).toEqual({ ok: false, error: "invalid_email" });
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it("Supabase OTP rate limit 은 rate_limited 로 매핑한다", async () => {
    mockSignInWithOtp.mockResolvedValue({
      error: { message: "rate", status: 429, code: "over_email_send_rate_limit" },
    });

    expect(await requestMagicLink("user@example.com")).toEqual({
      ok: false,
      error: "rate_limited",
    });
  });
});

describe("verifyMagicLinkToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("token_hash 를 email 타입으로 교환한다 (ADR-0007 flow)", async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });

    expect(await verifyMagicLinkToken("hash-123")).toEqual({ ok: true });
    expect(mockVerifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "hash-123" });
  });

  it("교환 실패 시 auth_failed", async () => {
    mockVerifyOtp.mockResolvedValue({ error: { message: "expired" } });

    expect(await verifyMagicLinkToken("hash-123")).toEqual({ ok: false, error: "auth_failed" });
  });
});

describe("signOut", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockUnregisterPushToken.mockResolvedValue({ ok: true, skipped: false });
  });

  it("kakao logout(best-effort) 후 supabase 세션을 폐기한다", async () => {
    mockKakaoLogout.mockResolvedValue(undefined);
    mockSignOut.mockResolvedValue({ error: null });

    expect(await signOut()).toEqual({ ok: true });
    expect(mockKakaoLogout).toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("kakao logout 실패가 supabase 세션 폐기를 막지 않는다", async () => {
    mockKakaoLogout.mockRejectedValue(new Error("no kakao session"));
    mockSignOut.mockResolvedValue({ error: null });

    expect(await signOut()).toEqual({ ok: true });
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("세션 폐기 전 현재 user 의 push token 을 무효화한다 (EVAL-0052)", async () => {
    mockKakaoLogout.mockResolvedValue(undefined);
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "user-1" } } } });
    mockSignOut.mockResolvedValue({ error: null });

    expect(await signOut()).toEqual({ ok: true });
    expect(mockUnregisterPushToken).toHaveBeenCalledWith("user-1");
    // 무효화는 RLS self-write 라 세션 폐기(signOut) 전에 일어나야 한다.
    expect(mockUnregisterPushToken.mock.invocationCallOrder[0]).toBeLessThan(
      mockSignOut.mock.invocationCallOrder[0],
    );
  });

  it("push token 무효화 실패가 세션 폐기를 막지 않는다", async () => {
    mockKakaoLogout.mockResolvedValue(undefined);
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "user-1" } } } });
    mockUnregisterPushToken.mockRejectedValue(new Error("network"));
    mockSignOut.mockResolvedValue({ error: null });

    expect(await signOut()).toEqual({ ok: true });
    expect(mockSignOut).toHaveBeenCalled();
  });
});

// G4 invite deep link orchestration 테스트 (EVAL-0013) — TS-rn-invite-1~5 흡수(05 D10).
// 실제 src/app 라우트 트리(renderRouter)로 미인증 stash → /login, 인증 accept → 착지,
// RPC 실패 상태 화면, 로그인 후 stash 복귀를 검증한다. IO(stash·RPC)만 모킹한다.
import { renderRouter, screen, waitFor } from "expo-router/testing-library";

declare global {
  namespace jest {
    interface Matchers<R> {
      toHavePathname(expected: string): R;
    }
  }
}

// root _layout 의 Kakao init 경고 억제 — init 자체는 아래 mock 으로 무력화된다
process.env.EXPO_PUBLIC_KAKAO_NATIVE_KEY = "test-kakao-key";

const mockUseSession = jest.fn();

jest.mock("@/features/auth", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: () => mockUseSession(),
  signOut: jest.fn(),
  requestMagicLink: jest.fn(),
  signInWithKakao: jest.fn(),
  verifyMagicLinkToken: jest.fn(),
}));

jest.mock("@/capabilities/kakao-auth", () => ({
  kakaoAuth: { init: jest.fn(), login: jest.fn(), logout: jest.fn() },
}));

jest.mock("@/services/supabase/client", () => ({
  getSupabaseClient: jest.fn(),
  registerAppStateAutoRefresh: () => () => {},
}));

// feature 공개 API(index)가 아니라 IO 모듈을 모킹 — 화면/PostAuthRedirect 의
// orchestration 로직은 실물 그대로 검증한다.
const mockAcceptInvite = jest.fn();
jest.mock("@/features/invite/api/invite-service", () => ({
  acceptInvite: (...args: unknown[]) => mockAcceptInvite(...args),
}));

const mockStashToken = jest.fn();
const mockTakeToken = jest.fn();
jest.mock("@/features/invite/api/invite-token-stash", () => ({
  stashPendingInviteToken: (...args: unknown[]) => mockStashToken(...args),
  takePendingInviteToken: (...args: unknown[]) => mockTakeToken(...args),
}));

const AUTHED = {
  session: { user: { email: "tester@fromwith.app" } },
  isLoading: false,
};
const UNAUTHED = { session: null, isLoading: false };

const CHALLENGE_ID = "11111111-2222-4333-8444-555555555555";
const TOKEN = "sample-invite-token";

const renderAppRouter = (initialUrl: string) => renderRouter("./src/app", { initialUrl });

describe("미인증 deep link — token stash → 로그인", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStashToken.mockResolvedValue(undefined);
    mockTakeToken.mockResolvedValue(null);
  });

  it("token 을 stash 한 뒤 /login 으로 보낸다 (수락 호출 없음)", async () => {
    mockUseSession.mockReturnValue(UNAUTHED);
    renderAppRouter(`/invite/${TOKEN}`);

    await waitFor(() => expect(screen).toHavePathname("/login"));
    expect(mockStashToken).toHaveBeenCalledWith(TOKEN);
    expect(mockAcceptInvite).not.toHaveBeenCalled();
  });

  it("세션 복원 중(isLoading)에는 stash/이동을 보류한다", () => {
    mockUseSession.mockReturnValue({ session: null, isLoading: true });
    renderAppRouter(`/invite/${TOKEN}`);

    expect(screen).toHavePathname(`/invite/${TOKEN}`);
    expect(mockStashToken).not.toHaveBeenCalled();
  });
});

describe("인증 deep link — accept_invite → 착지", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue(AUTHED);
    mockTakeToken.mockResolvedValue(null);
  });

  it("pending 서약이 있으면 /challenge/[id]/pledge 로 이동한다", async () => {
    mockAcceptInvite.mockResolvedValue({
      ok: true,
      groupId: "group-1",
      redirect: { kind: "pledge", challengeId: CHALLENGE_ID },
    });
    renderAppRouter(`/invite/${TOKEN}`);

    await waitFor(() => expect(screen).toHavePathname(`/challenge/${CHALLENGE_ID}/pledge`));
    expect(mockAcceptInvite).toHaveBeenCalledWith(TOKEN);
    expect(mockAcceptInvite).toHaveBeenCalledTimes(1);
  });

  it("active 챌린지만 있으면 챌린지 상세로 이동한다", async () => {
    mockAcceptInvite.mockResolvedValue({
      ok: true,
      groupId: "group-1",
      redirect: { kind: "challenge", challengeId: CHALLENGE_ID },
    });
    renderAppRouter(`/invite/${TOKEN}`);

    await waitFor(() => expect(screen).toHavePathname(`/challenge/${CHALLENGE_ID}`));
  });

  it("진행 중 챌린지가 없으면 /home 으로 이동한다", async () => {
    mockAcceptInvite.mockResolvedValue({
      ok: true,
      groupId: "group-1",
      redirect: { kind: "home" },
    });
    renderAppRouter(`/invite/${TOKEN}`);

    await waitFor(() => expect(screen).toHavePathname("/home"));
  });

  it("만료/없음(invalid_or_expired) 은 에러 화면을 보여준다 (RPC semantics 보존)", async () => {
    mockAcceptInvite.mockResolvedValue({ ok: false, error: "invalid_or_expired" });
    renderAppRouter(`/invite/${TOKEN}`);

    expect(await screen.findByText("유효하지 않은 초대")).toBeTruthy();
    expect(screen).toHavePathname(`/invite/${TOKEN}`);
  });

  it("group_full 은 꽉참 안내를 보여준다 (PRD §3.3 AC-4)", async () => {
    mockAcceptInvite.mockResolvedValue({ ok: false, error: "group_full" });
    renderAppRouter(`/invite/${TOKEN}`);

    expect(await screen.findByText("그룹이 가득 찼어요")).toBeTruthy();
  });
});

describe("세션 성립 후 stash 복귀 (PostAuthRedirect)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue(AUTHED);
  });

  it("stash 된 token 이 있으면 /invite/<token> 으로 복귀해 수락까지 잇는다", async () => {
    mockTakeToken.mockResolvedValue(TOKEN);
    mockAcceptInvite.mockResolvedValue({
      ok: true,
      groupId: "group-1",
      redirect: { kind: "pledge", challengeId: CHALLENGE_ID },
    });
    renderAppRouter("/login");

    await waitFor(() => expect(mockAcceptInvite).toHaveBeenCalledWith(TOKEN));
    await waitFor(() => expect(screen).toHavePathname(`/challenge/${CHALLENGE_ID}/pledge`));
  });

  it("stash 가 비어 있으면 /home 으로 우회한다 (G5 인증→login 우회 유지)", async () => {
    mockTakeToken.mockResolvedValue(null);
    renderAppRouter("/login");

    await waitFor(() => expect(screen).toHavePathname("/home"));
    expect(mockAcceptInvite).not.toHaveBeenCalled();
  });
});

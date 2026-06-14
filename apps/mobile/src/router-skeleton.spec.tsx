// G5 Expo Router skeleton 테스트 (EVAL-0014) — TS-rn-router-1~4 흡수(05 D10).
// auth gate(미인증→/login, 인증→login 우회)·route param 검증·legacy alias·
// 00 §8/§10 G5 route file 존재를 renderRouter(실제 src/app 트리) + fs 로 검증한다.
import { renderRouter, screen, waitFor } from "expo-router/testing-library";
import { existsSync } from "node:fs";
import { join } from "node:path";

// expo-router build 산출물의 expect.d.ts 가 `export {}` 로 비어 있어 (런타임은
// expect.extend 로 등록됨) matcher 타입만 로컬 보강한다. node 타입 보강은 test-env.d.ts.
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

// invite stash/accept IO 격리 — orchestration 자체는 invite-deep-link.spec 이 검증 (EVAL-0013)
jest.mock("@/features/invite/api/invite-token-stash", () => ({
  stashPendingInviteToken: jest.fn().mockResolvedValue(undefined),
  takePendingInviteToken: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/features/invite/api/invite-service", () => ({
  acceptInvite: jest.fn().mockResolvedValue({
    ok: true,
    groupId: "group-1",
    redirect: { kind: "home" },
  }),
}));

const AUTHED = {
  session: { user: { email: "tester@fromwith.app" } },
  isLoading: false,
};
const UNAUTHED = { session: null, isLoading: false };

// zod uuid 를 통과하는 v4 형식 (version=4, variant=8)
const CHALLENGE_ID = "11111111-2222-4333-8444-555555555555";

const renderAppRouter = (initialUrl: string) => renderRouter("./src/app", { initialUrl });

describe("auth gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("미인증 사용자가 /home 진입 시 /login 으로 차단된다", () => {
    mockUseSession.mockReturnValue(UNAUTHED);
    renderAppRouter("/home");
    expect(screen).toHavePathname("/login");
  });

  it("미인증 사용자가 challenge sub-route 진입 시 /login 으로 차단된다", () => {
    mockUseSession.mockReturnValue(UNAUTHED);
    renderAppRouter(`/challenge/${CHALLENGE_ID}/action`);
    expect(screen).toHavePathname("/login");
  });

  it("인증 사용자가 /login 진입 시 /home 으로 우회한다", async () => {
    mockUseSession.mockReturnValue(AUTHED);
    renderAppRouter("/login");
    // EVAL-0013: 우회 전 invite stash 조회(async)가 끼어들어 즉시 단언 불가
    await waitFor(() => expect(screen).toHavePathname("/home"));
  });

  it("인증 사용자는 /home 에 도달한다", () => {
    mockUseSession.mockReturnValue(AUTHED);
    renderAppRouter("/home");
    expect(screen).toHavePathname("/home");
  });

  it("세션 복원 중(isLoading)에는 게이트 판정을 보류한다 — flash 금지 (EVAL-0012)", () => {
    mockUseSession.mockReturnValue({ session: null, isLoading: true });
    renderAppRouter("/home");
    expect(screen).toHavePathname("/home");
  });
});

describe("route params", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("인증 사용자는 typed challengeId 로 /challenge/[id]/pledge 에 도달한다", () => {
    mockUseSession.mockReturnValue(AUTHED);
    renderAppRouter(`/challenge/${CHALLENGE_ID}/pledge`);
    expect(screen).toHavePathname(`/challenge/${CHALLENGE_ID}/pledge`);
  });

  it("uuid 가 아닌 challengeId 는 /home 으로 회수된다", () => {
    mockUseSession.mockReturnValue(AUTHED);
    renderAppRouter("/challenge/not-a-uuid/pledge");
    expect(screen).toHavePathname("/home");
  });

  it("미인증도 /invite/[token] 에 착지한다 (public — auth gate 미적용)", async () => {
    mockUseSession.mockReturnValue(UNAUTHED);
    renderAppRouter("/invite/sample-invite-token");
    // 동기 시점에는 (auth) group 이라 gate 차단 없이 invite 화면이 뜬다.
    expect(screen).toHavePathname("/invite/sample-invite-token");
    // EVAL-0013: 이후 token stash → /login 라우팅 (orchestration 상세는 invite-deep-link.spec)
    await waitFor(() => expect(screen).toHavePathname("/login"));
  });
});

describe("legacy alias (00 §1.2)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("인증 사용자의 legacy /action deep link 는 /home 으로 흡수된다", () => {
    mockUseSession.mockReturnValue(AUTHED);
    renderAppRouter("/action");
    expect(screen).toHavePathname("/home");
  });

  it("미인증 사용자의 legacy /pledge deep link 는 /login 으로 차단된다", () => {
    mockUseSession.mockReturnValue(UNAUTHED);
    renderAppRouter("/pledge");
    expect(screen).toHavePathname("/login");
  });
});

describe("G5 route map coverage (00 §8/§10)", () => {
  const G5_ROUTE_FILES = [
    "(auth)/login.tsx",
    "(auth)/invite/[token].tsx",
    "(app)/(tabs)/home.tsx",
    "(app)/(tabs)/me.tsx",
    "(app)/challenge/[id]/index.tsx",
    "(app)/challenge/[id]/action.tsx",
    "(app)/challenge/[id]/pledge.tsx",
    "(app)/challenge/[id]/recap.tsx",
    "(app)/(flow)/challenge/new.tsx",
  ];

  it.each(G5_ROUTE_FILES)("route file 존재: %s", (routeFile) => {
    expect(existsSync(join(__dirname, "app", routeFile))).toBe(true);
  });

  // alias 삭제 시 +not-found 가 같은 종착지로 수렴해 pathname 단언으론 회귀를
  // 못 잡는다 — 파일 존재로 deep link 호환(00 §1.2)을 결정론 검증
  const LEGACY_ALIAS_FILES = [
    "(app)/action.tsx",
    "(app)/feed.tsx",
    "(app)/pledge.tsx",
    "(app)/recap.tsx",
  ];

  it.each(LEGACY_ALIAS_FILES)("legacy alias route file 존재: %s", (aliasFile) => {
    expect(existsSync(join(__dirname, "app", aliasFile))).toBe(true);
  });

  it("navigation/ 디렉토리를 두지 않는다 — app/ 이 네비게이션 SoT (04 §5.1)", () => {
    expect(existsSync(join(__dirname, "navigation"))).toBe(false);
  });
});

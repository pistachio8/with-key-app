// EVAL-0017 read-only 화면 통합 테스트 — 실제 src/app 라우터 트리(renderRouter)에
// EVAL-0016 fixture 데이터를 물려 홈·챌린지 feed/dashboard/info 가 실데이터 shape 로
// 렌더되는지, RLS/빈/에러 경계에서 크래시 없이 안내를 보이는지 검증한다.
// read service 는 모듈 경계에서 mock — 계약 자체는 *-reads.spec(보존 eval)이 검증한다.
import { renderRouter, screen } from "expo-router/testing-library";

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

const mockFetchCurrentChallenges = jest.fn();
const mockFetchChallengeDetail = jest.fn();
const mockFetchMyUnsignedChallengeIds = jest.fn();

jest.mock("@/features/challenge/api/challenge-reads", () => ({
  fetchCurrentChallenges: (...args: unknown[]) => mockFetchCurrentChallenges(...args),
  fetchChallengeDetail: (...args: unknown[]) => mockFetchChallengeDetail(...args),
  fetchMyUnsignedChallengeIds: (...args: unknown[]) => mockFetchMyUnsignedChallengeIds(...args),
  fetchMyChallenges: jest.fn(),
  fetchPendingPledge: jest.fn(),
}));

const mockFetchChallengeFeed = jest.fn();

jest.mock("@/features/feed/api/feed-reads", () => ({
  fetchChallengeFeed: (...args: unknown[]) => mockFetchChallengeFeed(...args),
}));

const mockFetchMyDisplayName = jest.fn();

jest.mock("@/features/profile/api/profile-reads", () => ({
  fetchMyDisplayName: (...args: unknown[]) => mockFetchMyDisplayName(...args),
  hasEverCreatedChallenge: jest.fn().mockResolvedValue(false),
  fetchNotificationPrefs: jest.fn(),
}));

const mockFetchGroupDetail = jest.fn();

// group/[id] 화면이 barrel(@/features/group)로 소비하는 read — api 모듈을 mock 하면 barrel 로 전파.
jest.mock("@/features/group/api/group-reads", () => ({
  fetchGroupDetail: (...args: unknown[]) => mockFetchGroupDetail(...args),
  fetchMyGroups: jest.fn(),
}));

// eslint-disable-next-line import/first -- jest.mock 은 babel 이 hoist 하므로 모킹 선언을 위에 둔다
import { HOME_EXPECTED } from "../../../evals/fixtures/read-contracts/home";
// eslint-disable-next-line import/first
import { DETAIL_EXPECTED } from "../../../evals/fixtures/read-contracts/challenge-detail";
// eslint-disable-next-line import/first
import { FEED_RESPONSE } from "../../../evals/fixtures/read-contracts/feed";
// eslint-disable-next-line import/first
import { GROUP_EXPECTED } from "../../../evals/fixtures/read-contracts/group";
// eslint-disable-next-line import/first
import { BffRequestError } from "@/services/api/bff-client";

// fixture viewer u1(민지) 세션 — 보존 eval 과 같은 시점의 데이터를 화면에 물린다.
const AUTHED = {
  session: { user: { id: "u1", email: "tester@fromwith.app" } },
  isLoading: false,
};

// zod uuid 를 통과하는 v4 형식 (route param 검증용 — mock read 는 id 를 무시한다)
const CHALLENGE_ID = "11111111-2222-4333-8444-555555555555";

const renderAppRouter = (initialUrl: string) => renderRouter("./src/app", { initialUrl });

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSession.mockReturnValue(AUTHED);
  mockFetchCurrentChallenges.mockResolvedValue(HOME_EXPECTED);
  mockFetchChallengeDetail.mockResolvedValue(DETAIL_EXPECTED);
  mockFetchMyUnsignedChallengeIds.mockResolvedValue(new Set<string>());
  mockFetchChallengeFeed.mockResolvedValue(FEED_RESPONSE);
  mockFetchMyDisplayName.mockResolvedValue("민지");
  mockFetchGroupDetail.mockResolvedValue(GROUP_EXPECTED);
});

describe("home — current/pending/closed 요약 실데이터 렌더", () => {
  it("인사·정산 대기(over)·제목을 fixture 데이터로 렌더한다", async () => {
    renderAppRouter("/home");
    expect(await screen.findByText("안녕, 민지 👋")).toBeTruthy();
    // HOME_EXPECTED 는 phase 'over' 1건 — 정산 대기 섹션으로 분류된다 (ADR-0027).
    expect(await screen.findByText("정산 대기")).toBeTruthy();
    expect(screen.getByText("아침 운동")).toBeTruthy();
    expect(screen.getByText(/모인 벌금 3,000원/)).toBeTruthy();
  });

  it("미서명 pending 이 있으면 초대 배너를 렌더한다", async () => {
    const pending = {
      ...HOME_EXPECTED[0]!,
      groupId: "g2",
      groupName: "초대 그룹",
      challenge: {
        ...HOME_EXPECTED[0]!.challenge!,
        id: "c2",
        title: "저녁 러닝",
        status: "pending",
        phase: "pending",
      },
    };
    mockFetchCurrentChallenges.mockResolvedValue([...HOME_EXPECTED, pending]);
    mockFetchMyUnsignedChallengeIds.mockResolvedValue(new Set(["c2"]));

    renderAppRouter("/home");
    expect(await screen.findByText("초대받은 챌린지 1")).toBeTruthy();
    expect(screen.getByText("초대 그룹 · 저녁 러닝")).toBeTruthy();
    expect(mockFetchMyUnsignedChallengeIds).toHaveBeenCalledWith("u1", ["c2"]);
  });

  it("챌린지가 없으면 빈 상태 카피를 보인다 (비크래시)", async () => {
    mockFetchCurrentChallenges.mockResolvedValue([]);
    renderAppRouter("/home");
    expect(await screen.findByText("아직 진행 중인 챌린지가 없어요")).toBeTruthy();
  });

  it("read 실패 시 에러 안내 + 다시 시도를 보인다 (비크래시)", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    mockFetchCurrentChallenges.mockRejectedValue(new Error("network down"));
    renderAppRouter("/home");
    expect(await screen.findByText("불러오지 못했어요")).toBeTruthy();
    expect(screen.getByText("다시 시도")).toBeTruthy();
    consoleError.mockRestore();
  });
});

describe("challenge feed — logs + photo + metadata 렌더", () => {
  it("헤더(제목·조건)와 피드 카드(author·요약·키워드·kudos)를 렌더한다", async () => {
    renderAppRouter(`/challenge/${CHALLENGE_ID}`);
    expect(await screen.findByText("아침 운동")).toBeTruthy();
    // 헤더 메타 — goalCount/durationDays/penalty/참여 인원 (DETAIL fixture)
    expect(screen.getByText(/주 3회 · 7일 · 벌금 3천원 · 2명/)).toBeTruthy();
    // 피드 카드 (FEED fixture)
    expect(await screen.findByText("러닝 30분 완료 — 아침 공기가 상쾌했다.")).toBeTruthy();
    expect(screen.getByText("제이")).toBeTruthy();
    expect(screen.getByText("#러닝")).toBeTruthy();
    expect(screen.getByText("🔥 2")).toBeTruthy();
    // 본인(u1) 글에는 (나) 표기
    expect(screen.getByText("민지 (나)")).toBeTruthy();
  });

  it("피드가 비어 있으면 empty 카피를 보인다", async () => {
    mockFetchChallengeFeed.mockResolvedValue([]);
    renderAppRouter(`/challenge/${CHALLENGE_ID}`);
    expect(await screen.findByText("아직 인증이 없어요. 첫 번째 인증을 올려보세요.")).toBeTruthy();
  });

  it("RLS 경계 — 비멤버(detail null)는 접근 안내만 보고 피드를 못 본다", async () => {
    mockFetchChallengeDetail.mockResolvedValue(null);
    renderAppRouter(`/challenge/${CHALLENGE_ID}`);
    expect(await screen.findByText("챌린지를 찾을 수 없어요")).toBeTruthy();
    expect(mockFetchChallengeFeed).not.toHaveBeenCalled();
    expect(screen.queryByText("러닝 30분 완료 — 아침 공기가 상쾌했다.")).toBeNull();
  });

  it("BFF 401/403 — 권한 안내를 보이고 크래시하지 않는다", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    mockFetchChallengeFeed.mockRejectedValue(new BffRequestError(401, "unauthorized"));
    renderAppRouter(`/challenge/${CHALLENGE_ID}`);
    expect(await screen.findByText("피드를 볼 수 있는 권한이 없어요.")).toBeTruthy();
    // 헤더는 유지 — detail 은 RLS 로 이미 통과한 read.
    expect(screen.getByText("아침 운동")).toBeTruthy();
    consoleError.mockRestore();
  });
});

describe("challenge dashboard — doneCount/goalCount/기간/penalty 일치", () => {
  it("모인 벌금과 멤버별 doneCount/goalCount 진행률을 렌더한다", async () => {
    renderAppRouter(`/challenge/${CHALLENGE_ID}/dashboard`);
    expect(await screen.findByText("모인 벌금")).toBeTruthy();
    expect(screen.getByText("3,000원")).toBeTruthy();
    // DETAIL fixture — 민지 3/3회, 제이 1/3회 (제이는 미서명)
    expect(screen.getByText("3/3회")).toBeTruthy();
    expect(screen.getByText("1/3회")).toBeTruthy();
    expect(screen.getByText("서명 대기")).toBeTruthy();
    // 헤더 메타의 기간·벌금
    expect(screen.getByText(/7일 · 벌금 3천원/)).toBeTruthy();
  });

  it("read 실패 시 에러 안내 + 다시 시도 (비크래시)", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    mockFetchChallengeDetail.mockRejectedValue(new Error("boom"));
    renderAppRouter(`/challenge/${CHALLENGE_ID}/dashboard`);
    expect(await screen.findByText("불러오지 못했어요")).toBeTruthy();
    consoleError.mockRestore();
  });
});

describe("challenge info — 서약 조건/멤버/계좌 read-only", () => {
  it("기간·인증 빈도·벌금·참여 인원·운영자·멤버 서명 현황을 렌더한다", async () => {
    renderAppRouter(`/challenge/${CHALLENGE_ID}/info`);
    expect(await screen.findByText("운영자")).toBeTruthy();
    // "정보"는 탭 라벨 + 카드 제목 두 곳 — 활성 탭과 카드가 함께 렌더된다.
    expect(screen.getAllByText("정보").length).toBe(2);
    expect(screen.getByText("7일")).toBeTruthy();
    expect(screen.getByText("주 3회")).toBeTruthy();
    expect(screen.getByText("3천원")).toBeTruthy();
    expect(screen.getByText("2명")).toBeTruthy();
    expect(screen.getByText("3,000원")).toBeTruthy();
    // 멤버 서명 현황 (민지 서명 완료 · 제이 서명 대기) — 운영자 row 의 "민지" 포함 2회
    expect(screen.getAllByText("민지").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("서명 완료")).toBeTruthy();
    expect(screen.getByText("서명 대기")).toBeTruthy();
    // fixture 는 계좌 미등록 — 계좌 카드 미렌더
    expect(screen.queryByText("정산 계좌")).toBeNull();
  });

  it("RLS 경계 — 비멤버는 정보 탭도 접근 안내만 본다", async () => {
    mockFetchChallengeDetail.mockResolvedValue(null);
    renderAppRouter(`/challenge/${CHALLENGE_ID}/info`);
    expect(await screen.findByText("챌린지를 찾을 수 없어요")).toBeTruthy();
  });
});

describe("group detail — 헤더·계좌·멤버·챌린지 목록 read-only (EVAL-0077)", () => {
  it("그룹명·정산 계좌(마스킹)·멤버·챌린지 목록을 실데이터로 렌더한다", async () => {
    renderAppRouter("/group/g1");
    // 헤더 — 그룹명
    expect(await screen.findByText("운동 그룹")).toBeTruthy();
    // 정산 계좌 — 카드 + maskAccountNumber 표기
    expect(screen.getByText("정산 계좌")).toBeTruthy();
    expect(screen.getByText("****-**-****1234")).toBeTruthy();
    // 멤버 리스트 — 헤딩 + 멤버명
    expect(screen.getByText("멤버 (2명)")).toBeTruthy();
    expect(screen.getByText("제이")).toBeTruthy();
    // 챌린지 목록 — 헤딩 + 제목
    expect(screen.getByText("챌린지 (1개)")).toBeTruthy();
    expect(screen.getByText("아침 운동")).toBeTruthy();
  });

  it("계좌 미등록(bankCode/last4 null)이면 계좌 카드를 숨긴다", async () => {
    mockFetchGroupDetail.mockResolvedValue({
      ...GROUP_EXPECTED,
      bankCode: null,
      accountNumberLast4: null,
    });
    renderAppRouter("/group/g1");
    // 나머지 콘텐츠(그룹명)는 렌더되고 계좌 카드만 숨겨진다.
    expect(await screen.findByText("운동 그룹")).toBeTruthy();
    expect(screen.queryByText("정산 계좌")).toBeNull();
    expect(screen.queryByText("****-**-****1234")).toBeNull();
  });

  it("RLS 경계 — 비멤버/그룹 없음(null)은 빈 상태 안내만 본다", async () => {
    mockFetchGroupDetail.mockResolvedValue(null);
    renderAppRouter("/group/g1");
    expect(await screen.findByText("그룹을 찾을 수 없어요")).toBeTruthy();
    expect(screen.queryByText("운동 그룹")).toBeNull();
  });
});

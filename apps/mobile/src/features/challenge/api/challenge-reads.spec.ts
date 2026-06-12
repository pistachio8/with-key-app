// EVAL-0016 보존 eval (02 §5.2 — read 계약 결정론 스냅샷, pass^k=100%).
// evals/fixtures/read-contracts/* 의 동일 rows·NOW 로 RN read service 결과가
// web read(apps/web read-contract-parity.spec.ts)와 같은 EXPECTED 에 일치하는지 검증.
const mockGetSupabaseClient = jest.fn();

jest.mock("@/services/supabase/client", () => ({
  getSupabaseClient: (...args: unknown[]) => mockGetSupabaseClient(...args),
}));

// eslint-disable-next-line import/first -- jest.mock 은 babel 이 hoist 하므로 모킹 선언을 위에 둔다
import {
  HOME_NOW,
  HOME_TABLES,
  HOME_VIEWER,
  HOME_EXPECTED,
} from "../../../../../../evals/fixtures/read-contracts/home";
// eslint-disable-next-line import/first
import {
  DETAIL_NOW,
  DETAIL_TABLES,
  DETAIL_CHALLENGE_ID,
  DETAIL_EXPECTED,
} from "../../../../../../evals/fixtures/read-contracts/challenge-detail";
// eslint-disable-next-line import/first
import {
  ME_TABLES,
  ME_VIEWER,
  ME_EXPECTED,
} from "../../../../../../evals/fixtures/read-contracts/me";
// eslint-disable-next-line import/first
import { makeMockSupabase, type MockTables } from "@/shared/testing/mock-supabase";
// eslint-disable-next-line import/first
import {
  fetchCurrentChallenges,
  fetchChallengeDetail,
  fetchMyChallenges,
  fetchPendingPledge,
} from "./challenge-reads";

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe("read 계약 보존 스냅샷 — RN read service == fixture EXPECTED", () => {
  it("home: fetchCurrentChallenges == HOME_EXPECTED (web 과 동일 fixture)", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(HOME_NOW));
    mockGetSupabaseClient.mockReturnValue(makeMockSupabase(HOME_TABLES as MockTables));

    const views = await fetchCurrentChallenges(HOME_VIEWER);
    expect(views).toEqual(HOME_EXPECTED);
  });

  it("challenge: fetchChallengeDetail == DETAIL_EXPECTED (RN 계약 — doneByWeek 비노출)", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(DETAIL_NOW));
    mockGetSupabaseClient.mockReturnValue(makeMockSupabase(DETAIL_TABLES as MockTables));

    const view = await fetchChallengeDetail(DETAIL_CHALLENGE_ID);
    expect(view).toEqual(DETAIL_EXPECTED);
  });

  it("me: fetchMyChallenges == ME_EXPECTED", async () => {
    mockGetSupabaseClient.mockReturnValue(makeMockSupabase(ME_TABLES as MockTables));

    const my = await fetchMyChallenges(ME_VIEWER);
    expect(my).toEqual(ME_EXPECTED);
  });
});

describe("fetchPendingPledge", () => {
  it("대기 서약 — 멤버 서명 상태와 mySigned 를 조립한다", async () => {
    mockGetSupabaseClient.mockReturnValue(
      makeMockSupabase({
        challenge_participants: [
          {
            challenge_id: "c1",
            user_id: "u1",
            signed_at: "2026-04-30T00:00:00Z",
            users: { display_name: "민지" },
            challenges: {
              id: "c1",
              title: "아침 운동",
              goal_count: 3,
              duration_days: 7,
              penalty_amount: 3000,
              status: "pending",
            },
          },
          {
            challenge_id: "c1",
            user_id: "u2",
            signed_at: null,
            users: { display_name: "제이" },
            challenges: {
              id: "c1",
              title: "아침 운동",
              goal_count: 3,
              duration_days: 7,
              penalty_amount: 3000,
              status: "pending",
            },
          },
        ],
      }),
    );

    const pledge = await fetchPendingPledge("u1");
    expect(pledge).toEqual({
      id: "c1",
      title: "아침 운동",
      goalCount: 3,
      durationDays: 7,
      penaltyAmount: 3000,
      members: [
        { id: "u1", displayName: "민지", signed: true },
        { id: "u2", displayName: "제이", signed: false },
      ],
      mySigned: true,
    });
  });

  it("대기 건이 없으면 null", async () => {
    mockGetSupabaseClient.mockReturnValue(makeMockSupabase({}));
    await expect(fetchPendingPledge("u1")).resolves.toBeNull();
  });
});

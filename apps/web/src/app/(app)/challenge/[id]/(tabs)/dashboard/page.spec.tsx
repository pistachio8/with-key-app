// @vitest-environment node
// EVAL-0039 배선 회귀 — dashboard page 가 "이번 주 진척" 링·"주차 기록" 칩에
// viewer.visibleDoneByWeek(표시·peer_rejected 제외)를 넘기는지 검증한다.
// read 단언(challenge-detail.spec)만으로는 page 가 doneByWeek(full)로 되돌아가도 못 잡는 공백을 메운다.
import { describe, it, expect, vi, beforeEach } from "vitest";

// 링·칩 도메인 함수를 spy 로 — page 가 어떤 Map 을 인자로 넘기는지(배선)만 검증, 주차 계산 내부는 무관.
// 나머지 도메인 함수(challengePhase·toKstDayKey·dayIndexOf 등)는 actual 유지.
vi.mock("@withkey/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@withkey/domain")>();
  return {
    ...actual,
    buildWeekChips: vi.fn(() => []),
    currentWeekStatus: vi.fn(() => null),
  };
});

const getAuthedUser = vi.fn();
vi.mock("@/lib/supabase/auth", () => ({ getAuthedUser: () => getAuthedUser() }));

const fetchChallengeDetail = vi.fn();
vi.mock("@/lib/db/reads/challenge-detail", () => ({
  fetchChallengeDetail: (id: string) => fetchChallengeDetail(id),
}));

// user·detail 을 정상 주입하므로 redirect/notFound 는 호출되면 안 된다(호출 시 테스트 실패).
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect 가 호출되면 안 됨");
  }),
  notFound: vi.fn(() => {
    throw new Error("notFound 가 호출되면 안 됨");
  }),
}));

// 자식 컴포넌트는 렌더하지 않으므로 가볍게 mock — import 체인만 차단.
vi.mock("../../_components/dashboard-tab", () => ({ DashboardTab: () => null }));
vi.mock("./loading", () => ({ default: () => null }));

// viewer u2: 같은 주(week 1) 표시 2일(peer_rejected 제외) vs full 3일. status=closed → settleable, 시간 의존 제거.
function makeDetail() {
  const visibleDoneByWeek = new Map<number, number>([[1, 2]]);
  const doneByWeek = new Map<number, number>([[1, 3]]);
  return {
    id: "c1",
    title: "아침 운동",
    goalCount: 3,
    durationDays: 7,
    penaltyAmount: 3000,
    status: "closed" as const,
    startAt: "2026-05-01T00:00:00Z",
    endAt: "2026-05-08T15:00:00Z",
    closedAt: "2026-05-08T15:00:00Z",
    members: [
      { id: "u2", displayName: "JJ", doneCount: 2, signed: true, doneByWeek, visibleDoneByWeek },
    ],
    potTotal: 0,
    participantCount: 1,
    group: {
      id: "g1",
      ownerId: "u1",
      bankCode: null,
      accountHolder: null,
      accountNumberLast4: null,
    },
  };
}

describe("ChallengeDashboardPage 배선 (EVAL-0039)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("링·칩에 viewer.visibleDoneByWeek(표시·peer_rejected 제외)를 넘기고 doneByWeek(full)은 넘기지 않는다", async () => {
    const { buildWeekChips, currentWeekStatus } = await import("@withkey/domain");
    const { DashboardSection } = await import("./page");
    const detail = makeDetail();
    getAuthedUser.mockResolvedValue({ user: { id: "u2" } });
    fetchChallengeDetail.mockResolvedValue(detail);

    await DashboardSection({ params: Promise.resolve({ id: "c1" }) });

    const viewer = detail.members[0];
    expect(buildWeekChips).toHaveBeenCalledTimes(1);
    expect(currentWeekStatus).toHaveBeenCalledTimes(1);

    // 핵심 배선: 정확히 표시 집합 Map 참조를 넘긴다 — full(doneByWeek)로 되돌리면 이 단언이 깨진다.
    expect(vi.mocked(buildWeekChips).mock.calls[0][0]).toBe(viewer.visibleDoneByWeek);
    expect(vi.mocked(buildWeekChips).mock.calls[0][0]).not.toBe(viewer.doneByWeek);
    expect(vi.mocked(currentWeekStatus).mock.calls[0][0]).toBe(viewer.visibleDoneByWeek);

    // 내용 확인: 표시 집합 week1=2(peer_rejected 제외), full 은 3.
    const passed = vi.mocked(buildWeekChips).mock.calls[0][0] as ReadonlyMap<number, number>;
    expect(passed.get(1)).toBe(2);
  });

  it("viewer 가 멤버가 아니면 빈 Map 을 넘긴다(폴백)", async () => {
    const { buildWeekChips } = await import("@withkey/domain");
    const { DashboardSection } = await import("./page");
    const detail = makeDetail();
    getAuthedUser.mockResolvedValue({ user: { id: "stranger" } });
    fetchChallengeDetail.mockResolvedValue(detail);

    await DashboardSection({ params: Promise.resolve({ id: "c1" }) });

    const passed = vi.mocked(buildWeekChips).mock.calls[0][0] as ReadonlyMap<number, number>;
    expect(passed.size).toBe(0);
  });
});

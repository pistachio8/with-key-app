// EVAL-0017 — 홈 요약 read-only 렌더: 진행(running)/미서명(pending 초대)/종료 대기(over)
// 3분류 + stats 4칸 + 빈 상태. web home/page.tsx 와 같은 분기 기준(ADR-0027).
import { render, screen } from "@testing-library/react-native";
import type { GroupChallengeView } from "@withkey/domain";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

// eslint-disable-next-line import/first -- jest.mock 은 babel 이 hoist 하므로 모킹 선언을 위에 둔다
import { HomeOverview } from "./home-overview";

type ChallengeView = NonNullable<GroupChallengeView["challenge"]>;

function makeGroup(
  groupId: string,
  challenge: Partial<ChallengeView> & Pick<ChallengeView, "id" | "title" | "status" | "phase">,
): GroupChallengeView {
  return {
    groupId,
    groupName: `${groupId} 그룹`,
    bankCode: null,
    accountHolder: null,
    accountNumberLast4: null,
    challenge: {
      goalCount: 3,
      durationDays: 7,
      penaltyAmount: 3000,
      startAt: "2026-05-01T00:00:00Z",
      endAt: "2026-05-08T15:00:00Z",
      doneCount: 0,
      daysLeft: 3,
      potTotal: 0,
      myConfirmedPenalty: 0,
      participantCount: 2,
      userIsParticipant: true,
      verifiedToday: false,
      ...challenge,
    },
  };
}

const RUNNING = makeGroup("g-run", {
  id: "c-run",
  title: "아침 운동",
  status: "active",
  phase: "running",
  potTotal: 3000,
  myConfirmedPenalty: 3000,
  verifiedToday: false,
});

const PENDING_UNSIGNED = makeGroup("g-pending", {
  id: "c-pending",
  title: "저녁 러닝",
  status: "pending",
  phase: "pending",
});

const OVER = makeGroup("g-over", {
  id: "c-over",
  title: "지난 챌린지",
  status: "active",
  phase: "over",
  potTotal: 6000,
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("HomeOverview (read-only)", () => {
  it("진행/미서명/종료 대기 3분류와 stats 를 렌더한다", () => {
    render(
      <HomeOverview
        groups={[RUNNING, PENDING_UNSIGNED, OVER]}
        unsignedPendingIds={new Set(["c-pending"])}
      />,
    );

    // 미서명 초대 배너
    expect(screen.getByText("초대받은 챌린지 1")).toBeTruthy();
    expect(screen.getByText("g-pending 그룹 · 저녁 러닝")).toBeTruthy();

    // stats — running + 본인 참가만 (1건): 진행 1 · 완료 0 · 미인증 1 · 내 벌금 3,000원
    expect(screen.getByText("진행 중")).toBeTruthy();
    expect(screen.getByText("오늘 완료")).toBeTruthy();
    expect(screen.getByText("미인증")).toBeTruthy();
    // 내 벌금 stat + 진행 row 의 "모인 벌금 3,000원" — 두 곳 모두 fixture 값으로 렌더.
    expect(screen.getAllByText(/3,000/).length).toBeGreaterThanOrEqual(2);

    // 진행 중 리스트(over 제외 — pending 도 포함돼 2개)
    expect(screen.getByText("진행 중 챌린지")).toBeTruthy();
    expect(screen.getByText("아침 운동")).toBeTruthy();
    expect(screen.getByText("저녁 러닝")).toBeTruthy();

    // 정산 대기(over)
    expect(screen.getByText("정산 대기")).toBeTruthy();
    expect(screen.getByText("지난 챌린지")).toBeTruthy();
    expect(screen.getByText(/종료 · 정산하기/)).toBeTruthy();
  });

  it("오늘 인증 여부에 따라 오늘 완료/미인증 메타가 갈린다", () => {
    const verified = makeGroup("g-done", {
      id: "c-done",
      title: "완료 챌린지",
      status: "active",
      phase: "running",
      verifiedToday: true,
    });
    render(<HomeOverview groups={[verified]} unsignedPendingIds={new Set()} />);
    expect(screen.getByText(/오늘 완료 · 모인 벌금/)).toBeTruthy();
  });

  it("챌린지가 하나도 없으면 빈 상태 카피를 렌더한다", () => {
    const emptyGroup: GroupChallengeView = {
      groupId: "g1",
      groupName: "빈 그룹",
      bankCode: null,
      accountHolder: null,
      accountNumberLast4: null,
      challenge: null,
    };
    render(<HomeOverview groups={[emptyGroup]} unsignedPendingIds={new Set()} />);
    expect(screen.getByText("아직 진행 중인 챌린지가 없어요")).toBeTruthy();
    expect(screen.queryByText("진행 중 챌린지")).toBeNull();
  });

  it("서명한 pending(초대 아님)은 배너 없이 진행 중 리스트에 '서명 대기'로 보인다", () => {
    render(<HomeOverview groups={[PENDING_UNSIGNED]} unsignedPendingIds={new Set()} />);
    expect(screen.queryByText(/초대받은 챌린지/)).toBeNull();
    expect(screen.getByText(/서명 대기/)).toBeTruthy();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RunningChallengeList } from "./running-challenge-list";
import type { GroupChallengeView } from "@/lib/db/reads/current-challenges";

function makeGroup(
  overrides: Partial<NonNullable<GroupChallengeView["challenge"]>> = {},
  group: Partial<GroupChallengeView> = {},
): GroupChallengeView {
  return {
    groupId: "g1",
    groupName: "찐친4",
    bankCode: null,
    accountHolder: null,
    accountNumberLast4: null,
    ...group,
    challenge: {
      id: "c1",
      title: "30일 헬스장 출석",
      goalCount: 7,
      durationDays: 30,
      penaltyAmount: 1000,
      status: "active",
      startAt: "2026-05-01T00:00:00Z",
      endAt: null,
      doneCount: 5,
      daysLeft: 15,
      potTotal: 4000,
      participantCount: 4,
      verifiedToday: false,
      ...overrides,
    },
  };
}

describe("RunningChallengeList", () => {
  it("groups.length=0 → null 렌더", () => {
    const { container } = render(<RunningChallengeList groups={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("active + 오늘 미인증 → '오늘 미인증' meta + D-N 표시", () => {
    render(<RunningChallengeList groups={[makeGroup({ verifiedToday: false })]} />);
    expect(screen.getByText("30일 헬스장 출석")).toBeTruthy();
    expect(screen.getByText("오늘 미인증")).toBeTruthy();
    expect(screen.getByText("D-15")).toBeTruthy();
  });

  it("active + 오늘 완료 → '오늘 완료' meta", () => {
    render(<RunningChallengeList groups={[makeGroup({ verifiedToday: true })]} />);
    expect(screen.getByText("오늘 완료")).toBeTruthy();
  });

  it("pending 상태 → '대기' + '서명 대기' meta", () => {
    render(<RunningChallengeList groups={[makeGroup({ status: "pending" })]} />);
    expect(screen.getByText("대기")).toBeTruthy();
    expect(screen.getByText("서명 대기")).toBeTruthy();
  });

  it("link href 는 /challenge/{id}", () => {
    render(<RunningChallengeList groups={[makeGroup()]} />);
    const link = screen.getByRole("link", { name: /30일 헬스장 출석/ });
    expect(link.getAttribute("href")).toBe("/challenge/c1");
  });
});

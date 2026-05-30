import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SettlementPendingList } from "./settlement-pending-list";
import type { GroupChallengeView } from "@/lib/db/reads/current-challenges";

function makeGroup(
  overrides: Partial<NonNullable<GroupChallengeView["challenge"]>> = {},
): GroupChallengeView {
  return {
    groupId: "g1",
    groupName: "찐친4",
    bankCode: null,
    accountHolder: null,
    accountNumberLast4: null,
    challenge: {
      id: "c1",
      title: "30일 헬스장 출석",
      goalCount: 7,
      durationDays: 30,
      penaltyAmount: 1000,
      status: "active",
      phase: "over",
      startAt: "2026-05-01T00:00:00Z",
      endAt: "2026-05-08T00:00:00Z",
      doneCount: 5,
      daysLeft: 0,
      potTotal: 3000,
      participantCount: 4,
      userIsParticipant: true,
      verifiedToday: false,
      ...overrides,
    },
  };
}

describe("SettlementPendingList", () => {
  it("over 챌린지 없으면 null 렌더", () => {
    const { container } = render(
      <SettlementPendingList groups={[makeGroup({ phase: "running" })]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("over 챌린지 → '정산 대기' 섹션 + recap 링크", () => {
    render(<SettlementPendingList groups={[makeGroup()]} />);
    expect(screen.getByText("정산 대기")).toBeTruthy();
    expect(screen.getByText("종료 · 정산하기")).toBeTruthy();
    const link = screen.getByRole("link", { name: /30일 헬스장 출석/ });
    expect(link.getAttribute("href")).toBe("/challenge/c1/recap");
  });
});

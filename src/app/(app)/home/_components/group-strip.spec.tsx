// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { GroupChallengeView } from "@/lib/db/reads/current-challenges";
import { GroupStrip } from "./group-strip";

function makeGroup(overrides: Partial<GroupChallengeView> = {}): GroupChallengeView {
  return {
    groupId: "g-1",
    groupName: "민지네",
    bankCode: null,
    accountHolder: null,
    accountNumberLast4: null,
    challenge: {
      id: "c-1",
      title: "주 3회 헬스장",
      goalCount: 3,
      durationDays: 7,
      penaltyAmount: 3000,
      status: "active",
      startAt: null,
      endAt: null,
      doneCount: 1,
      daysLeft: 4,
      potTotal: 12000,
      participantCount: 4,
    },
    ...overrides,
  };
}

describe("GroupStrip", () => {
  it("0 groups: shows '새 그룹 만들기' empty state", () => {
    render(<GroupStrip groups={[]} />);
    const cta = screen.getByRole("link", { name: /새 그룹 만들기/ });
    expect(cta.getAttribute("href")).toBe("/group/new");
  });

  it("1 group with challenge: renders ProgressCard + 현황 보기 link", () => {
    render(<GroupStrip groups={[makeGroup()]} />);
    expect(screen.getByText(/주 3회 헬스장/)).toBeTruthy();
    const detailLink = screen.getByRole("link", { name: /현황 보기/ });
    expect(detailLink.getAttribute("href")).toBe("/challenge/c-1");
  });

  it("1 group without challenge: shows 새로운 서약서 만들기 CTA with groupId", () => {
    render(
      <GroupStrip
        groups={[makeGroup({ groupId: "g-2", groupName: "제이제이네", challenge: null })]}
      />,
    );
    const cta = screen.getByRole("link", { name: /새로운 서약서 만들기/ });
    expect(cta.getAttribute("href")).toBe("/challenge/new?groupId=g-2");
  });

  it("N groups: renders a scroll strip with every group's name", () => {
    render(
      <GroupStrip
        groups={[
          makeGroup({ groupId: "g-1", groupName: "민지네" }),
          makeGroup({ groupId: "g-2", groupName: "제이제이네", challenge: null }),
          makeGroup({ groupId: "g-3", groupName: "희수네" }),
        ]}
      />,
    );
    expect(screen.getByText("민지네")).toBeTruthy();
    expect(screen.getByText("제이제이네")).toBeTruthy();
    expect(screen.getByText("희수네")).toBeTruthy();
  });
});

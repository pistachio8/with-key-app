// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardTab } from "./dashboard-tab";
import type { WeekChip, CurrentWeekStatus } from "@withkey/domain";

const weeks: WeekChip[] = [
  { week: 1, goal: 3, done: 3, state: "achieved" },
  { week: 2, goal: 3, done: 1, state: "current" },
];
const currentWeek: CurrentWeekStatus = {
  week: 2,
  goal: 3,
  done: 1,
  daysLeftInWeek: 5,
  shortfall: 2,
  atRiskAmount: 3000,
  imminent: false,
  unreachable: false,
};
const baseProps = {
  potTotal: 6000,
  weeks,
  currentWeek,
  daysRemaining: 15,
  phase: "running" as const,
  goalCount: 3,
  members: [
    { id: "u1", displayName: "두두", doneCount: 13, signed: true, doneByWeek: new Map() },
    { id: "u2", displayName: "민지", doneCount: 15, signed: true, doneByWeek: new Map() },
  ],
};

describe("DashboardTab (H3)", () => {
  it("누적 금액 행 '모인 벌금' + 금액", () => {
    render(<DashboardTab {...baseProps} />);
    expect(screen.getByText("모인 벌금")).toBeTruthy();
    expect(screen.getByText("6,000")).toBeTruthy();
  });

  it("주차 칩 렌더", () => {
    render(<DashboardTab {...baseProps} />);
    expect(screen.getByText("1주 3/3")).toBeTruthy();
    expect(screen.getByText("2주 1/3")).toBeTruthy();
  });

  it("running: 이번 주 링 카피 렌더", () => {
    render(<DashboardTab {...baseProps} />);
    expect(screen.getByText("2번 더 채우면 추가 벌금 0원")).toBeTruthy();
  });

  it("over/closed: currentWeek null 이면 링 미표시", () => {
    render(<DashboardTab {...baseProps} phase="over" currentWeek={null} daysRemaining={null} />);
    expect(screen.queryByText(/이번 주 진척/)).toBeNull();
  });

  it("멤버 strip 유지 — 멤버 이름 렌더", () => {
    render(<DashboardTab {...baseProps} />);
    expect(screen.getByText("두두")).toBeTruthy();
    expect(screen.getByText("민지")).toBeTruthy();
  });

  it("placeholder KPI(실패 N회) 미표시", () => {
    render(<DashboardTab {...baseProps} />);
    expect(screen.queryByText(/실패/)).toBeNull();
  });
});

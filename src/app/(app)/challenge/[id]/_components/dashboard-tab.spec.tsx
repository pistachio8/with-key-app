// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardTab } from "./dashboard-tab";

const baseProps = {
  totalPenalty: 15000,
  totalActions: 27,
  totalFailures: 3,
  daysRemaining: 15,
  goalCount: 30,
  phase: "running" as const,
  members: [
    { id: "u1", displayName: "두두", doneCount: 13, signed: true },
    { id: "u2", displayName: "민지", doneCount: 15, signed: true },
  ],
};

describe("DashboardTab", () => {
  it("renders 누적 벌금 with toLocaleString-formatted amount", () => {
    render(<DashboardTab {...baseProps} />);
    expect(screen.getByText("누적 벌금")).toBeTruthy();
    expect(screen.getByText("15,000")).toBeTruthy();
  });

  it("renders 3 KPI pills with action/failure/remaining day counts", () => {
    render(<DashboardTab {...baseProps} />);
    expect(screen.getByText("총 인증 27회")).toBeTruthy();
    expect(screen.getByText("실패 3회")).toBeTruthy();
    expect(screen.getByText("남은 15일")).toBeTruthy();
  });

  it("shows '시작 전' when phase is pending", () => {
    render(<DashboardTab {...baseProps} phase="pending" daysRemaining={null} />);
    expect(screen.getByText("시작 전")).toBeTruthy();
  });

  it("shows '곧 시작' when phase is accepted", () => {
    render(<DashboardTab {...baseProps} phase="accepted" daysRemaining={null} />);
    expect(screen.getByText("곧 시작")).toBeTruthy();
  });

  it("shows '종료' when phase is closed", () => {
    render(<DashboardTab {...baseProps} phase="closed" daysRemaining={0} />);
    expect(screen.getByText("종료")).toBeTruthy();
  });

  it("over(만기) → '종료' (남은 0일 금지)", () => {
    render(<DashboardTab {...baseProps} phase="over" daysRemaining={0} />);
    expect(screen.getByText("종료")).toBeTruthy();
    expect(screen.queryByText(/남은/)).toBeNull();
  });

  it("does NOT show '종료' for pending with null daysRemaining (regression: endAt-null bug)", () => {
    render(<DashboardTab {...baseProps} phase="pending" daysRemaining={null} />);
    expect(screen.queryByText("종료")).toBeNull();
  });
});

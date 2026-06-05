import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RowPendingIndicator } from "./row-pending-indicator";

let pendingValue = false;
vi.mock("next/link", async () => {
  const actual = await vi.importActual<typeof import("next/link")>("next/link");
  return { ...actual, useLinkStatus: () => ({ pending: pendingValue }) };
});

describe("RowPendingIndicator", () => {
  beforeEach(() => {
    pendingValue = false;
  });

  it("pending=false + running 시 D-N 표시", () => {
    pendingValue = false;
    render(<RowPendingIndicator daysLeft={3} joinedLate={false} phase="running" />);
    expect(screen.getByText("D-3")).toBeTruthy();
  });

  it("pending=false + pending phase 시 '대기' 표시", () => {
    pendingValue = false;
    render(<RowPendingIndicator daysLeft={0} joinedLate={false} phase="pending" />);
    expect(screen.getByText("대기")).toBeTruthy();
  });

  it("pending=false + joinedLate 시 '다음부터' 표시", () => {
    pendingValue = false;
    render(<RowPendingIndicator daysLeft={3} joinedLate={true} phase="running" />);
    expect(screen.getByText("다음부터")).toBeTruthy();
  });

  it("pending=true 시 spinner 표시 + D-N 비표시", () => {
    pendingValue = true;
    render(<RowPendingIndicator daysLeft={3} joinedLate={false} phase="running" />);
    expect(screen.getByLabelText("진입 중")).toBeTruthy();
    expect(screen.queryByText("D-3")).toBeFalsy();
  });
});

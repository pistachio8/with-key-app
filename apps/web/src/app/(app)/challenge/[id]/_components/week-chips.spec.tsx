// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WeekChips } from "./week-chips";
import type { WeekChip } from "@/lib/challenge/weekly";

const chips: WeekChip[] = [
  { week: 1, goal: 3, done: 3, state: "achieved" },
  { week: 2, goal: 3, done: 1, state: "missed" },
  { week: 3, goal: 3, done: 1, state: "current" },
  { week: 4, goal: 3, done: 0, state: "future" },
];

describe("WeekChips", () => {
  it("각 주차의 N/목표 텍스트를 렌더", () => {
    render(<WeekChips weeks={chips} />);
    expect(screen.getByText("1주 3/3")).toBeTruthy();
    expect(screen.getByText("2주 1/3")).toBeTruthy();
    expect(screen.getByText("4주 0/3")).toBeTruthy();
  });

  it("주차별 기록 aria-label 리스트", () => {
    render(<WeekChips weeks={chips} />);
    expect(screen.getByLabelText("주차별 기록")).toBeTruthy();
  });

  it("빈 배열이면 아무 칩도 렌더 안 함", () => {
    const { container } = render(<WeekChips weeks={[]} />);
    expect(container.querySelectorAll("li").length).toBe(0);
  });
});

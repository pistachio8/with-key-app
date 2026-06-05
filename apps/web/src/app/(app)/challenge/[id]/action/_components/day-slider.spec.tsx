// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DaySlider } from "./day-slider";

describe("DaySlider", () => {
  it("일차마다 칸을 렌더하고 aria-label 을 단다", () => {
    render(<DaySlider totalDays={5} currentDay={3} verifiedDays={[1, 2, 3]} />);
    expect(screen.getByLabelText("1일차, 인증함")).toBeTruthy();
    expect(screen.getByLabelText("3일차, 오늘 인증함")).toBeTruthy();
    expect(screen.getByLabelText("4일차, 미인증")).toBeTruthy();
    expect(screen.getByLabelText("5일차, 미인증")).toBeTruthy();
  });

  it("인증한 칸은 streak 배경 변수를 쓴다", () => {
    render(<DaySlider totalDays={3} currentDay={2} verifiedDays={[1, 2]} />);
    const day2 = screen.getByLabelText("2일차, 오늘 인증함");
    // streak 2 → --streak-2
    expect(day2.getAttribute("style")).toContain("var(--streak-2)");
  });
});

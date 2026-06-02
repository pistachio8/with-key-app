// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WeekRing } from "./week-ring";
import type { CurrentWeekStatus } from "@/lib/challenge/weekly";

const base: CurrentWeekStatus = {
  week: 2,
  goal: 3,
  done: 1,
  daysLeftInWeek: 5,
  shortfall: 2,
  atRiskAmount: 3000,
  imminent: false,
};

describe("WeekRing", () => {
  it("이번 주 done/goal 게이지 텍스트", () => {
    render(<WeekRing status={base} />);
    expect(screen.getByText("1/3")).toBeTruthy();
    expect(screen.getByText(/이번 주/)).toBeTruthy();
  });

  it("shortfall>0 평소: '2번 더 채우면 추가 벌금 0원' (동적, literal 금지)", () => {
    render(<WeekRing status={base} />);
    expect(screen.getByText("2번 더 채우면 추가 벌금 0원")).toBeTruthy();
  });

  it("달성(shortfall 0): 긍정 완료 카피, 위험 미표시", () => {
    render(<WeekRing status={{ ...base, done: 3, shortfall: 0, atRiskAmount: 0 }} />);
    expect(screen.getByText("이번 주 목표를 채웠어요")).toBeTruthy();
    expect(screen.queryByText(/이대로면/)).toBeNull();
  });

  it("imminent: '이대로면 +3,000원' 명시", () => {
    render(<WeekRing status={{ ...base, daysLeftInWeek: 2, imminent: true }} />);
    expect(screen.getByText("이대로면 +3,000원")).toBeTruthy();
  });

  it("0원 챌린지(atRiskAmount 0): imminent 라도 +원 미표시", () => {
    render(<WeekRing status={{ ...base, atRiskAmount: 0, daysLeftInWeek: 2, imminent: false }} />);
    expect(screen.queryByText(/이대로면/)).toBeNull();
  });
});

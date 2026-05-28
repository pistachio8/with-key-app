import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatsGrid } from "./stats-grid";

describe("StatsGrid", () => {
  it("4 stats 라벨과 값이 모두 노출", () => {
    render(<StatsGrid activeCount={3} completedToday={2} pendingToday={1} totalPenalty={5000} />);
    expect(screen.getByText("진행 중")).toBeTruthy();
    expect(screen.getByText("오늘 완료")).toBeTruthy();
    expect(screen.getByText("미인증")).toBeTruthy();
    expect(screen.getByText("예정 벌금")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    // 벌금 셀: 숫자 + "원" 분리 렌더
    expect(screen.getByText("5,000")).toBeTruthy();
    expect(screen.getByText("원")).toBeTruthy();
  });

  it("값이 0이면 그대로 0 노출 (빈 상태도 비주얼 유지)", () => {
    render(<StatsGrid activeCount={0} completedToday={0} pendingToday={0} totalPenalty={0} />);
    // 4개 셀 모두 "0" — 동일 텍스트 4번 등장.
    expect(screen.getAllByText("0").length).toBe(4);
    // 벌금 단위 "원" 노출
    expect(screen.getByText("원")).toBeTruthy();
  });
});

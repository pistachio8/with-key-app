// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MyPenaltyCard } from "./my-penalty-card";

describe("MyPenaltyCard", () => {
  it("viewerAchieved=true 시 정산 금액 없음 + 축하 카피", () => {
    render(
      <MyPenaltyCard
        doneCount={5}
        goalCount={3}
        viewerAchieved={true}
        viewerPerHeadPenalty={0}
        totalPenalty={3000}
      />,
    );
    expect(screen.getByText(/축하해요/)).toBeTruthy();
    expect(screen.getByText(/5 \/ 3/)).toBeTruthy();
  });

  it("viewerAchieved=false 시 큰 ₩X + 진행도 표시", () => {
    render(
      <MyPenaltyCard
        doneCount={1}
        goalCount={3}
        viewerAchieved={false}
        viewerPerHeadPenalty={3000}
        totalPenalty={6000}
      />,
    );
    expect(screen.getByText(/3,000/)).toBeTruthy();
    expect(screen.getByText(/1 \/ 3/)).toBeTruthy();
  });
});

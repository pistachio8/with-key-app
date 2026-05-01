// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RecapHero } from "./recap-hero";

describe("RecapHero", () => {
  const base = {
    title: "주 3회 헬스장",
    startAt: "2026-05-01T00:00:00Z",
    endAt: "2026-05-08T00:00:00Z",
  };

  it("viewer 달성 시 '목표 달성!' 표시", () => {
    render(<RecapHero {...base} viewerAchieved={true} anyoneAchieved={true} />);
    expect(screen.getByText("목표 달성!")).toBeTruthy();
    expect(screen.getByText("주 3회 헬스장")).toBeTruthy();
  });

  it("viewer 미달 · 타인 달성 시 '이번 주는 아쉬웠어요'", () => {
    render(<RecapHero {...base} viewerAchieved={false} anyoneAchieved={true} />);
    expect(screen.getByText("이번 주는 아쉬웠어요")).toBeTruthy();
  });

  it("전원 미달성 시 '다음 주엔 같이 해봐요'", () => {
    render(<RecapHero {...base} viewerAchieved={false} anyoneAchieved={false} />);
    expect(screen.getByText("다음 주엔 같이 해봐요")).toBeTruthy();
  });

  it("기간을 MM.DD ~ MM.DD 포맷으로 표시", () => {
    render(<RecapHero {...base} viewerAchieved={true} anyoneAchieved={true} />);
    // ko-KR / Asia/Seoul, parts 기반 포맷 → "05.01 ~ 05.08"
    expect(screen.getByText(/05\.01\s*~\s*05\.08/)).toBeTruthy();
  });
});

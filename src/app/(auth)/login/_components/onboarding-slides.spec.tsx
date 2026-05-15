import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OnboardingSlides } from "./onboarding-slides";

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

beforeEach(() => {
  replaceMock.mockReset();
  window.localStorage.clear();
});

describe("<OnboardingSlides />", () => {
  it("renders the first slide on mount", () => {
    render(<OnboardingSlides />);
    expect(screen.getByText("AI 운동일기 자동 생성")).toBeTruthy();
    expect(screen.getByRole("button", { name: "다음" })).toBeTruthy();
  });

  it('advances to the next slide on "다음" click', () => {
    render(<OnboardingSlides />);
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByText("운동 인증 기반 습관 형성")).toBeTruthy();
  });

  it('shows "시작하기" on the last slide and finishes onboarding on click', () => {
    render(<OnboardingSlides />);
    // 1 → 2 → 3 → 4
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByText("친구들과 함께 챌린지")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    expect(window.localStorage.getItem("withkey:onboarded")).toBe("1");
    expect(replaceMock).toHaveBeenCalledWith("/home");
  });

  it('"건너뛰기" sets the onboarded flag and redirects', () => {
    render(<OnboardingSlides />);
    fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
    expect(window.localStorage.getItem("withkey:onboarded")).toBe("1");
    expect(replaceMock).toHaveBeenCalledWith("/home");
  });

  it("already-onboarded users get redirected straight to /home on mount", () => {
    window.localStorage.setItem("withkey:onboarded", "1");
    render(<OnboardingSlides />);
    expect(replaceMock).toHaveBeenCalledWith("/home");
  });
});

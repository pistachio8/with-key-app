import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OnboardingSlides } from "./onboarding-slides";

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

// ADR-0006 — finish() 는 markOnboarded() Server Action 을 호출한다.
// 단위 테스트에선 mock 으로 호출 시그니처와 실패 시 라우팅 강행 정책을 검증한다.
const markOnboardedMock = vi.fn();
vi.mock("../_actions", () => ({
  markOnboarded: (...args: unknown[]) => markOnboardedMock(...args),
}));

beforeEach(() => {
  replaceMock.mockReset();
  markOnboardedMock.mockReset();
  markOnboardedMock.mockResolvedValue({
    ok: true,
    data: { onboardedAt: "2026-05-16T12:34:56.789Z" },
  });
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

  it('shows "시작하기" on the last slide and calls markOnboarded + redirects on click', () => {
    render(<OnboardingSlides />);
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByText("친구들과 함께 챌린지")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    expect(markOnboardedMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith("/home");
  });

  it('"건너뛰기" also calls markOnboarded and redirects', () => {
    render(<OnboardingSlides />);
    fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
    expect(markOnboardedMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith("/home");
  });

  it("still redirects to /home when markOnboarded rejects (silent failure policy)", () => {
    markOnboardedMock.mockRejectedValueOnce(new Error("network down"));
    render(<OnboardingSlides />);
    fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
    expect(replaceMock).toHaveBeenCalledWith("/home");
  });
});

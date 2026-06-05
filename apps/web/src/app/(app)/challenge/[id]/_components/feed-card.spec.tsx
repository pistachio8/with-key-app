// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";

// next/image 는 jsdom 에서 remotePatterns 검증을 피하기 위해 plain img 로 스텁.
vi.mock("next/image", () => ({
  default: (
    props: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; unoptimized?: boolean },
  ) => {
    const { fill, unoptimized, ...rest } = props;
    void fill;
    void unoptimized;
    // eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element -- rest includes alt; test-only mock
    return <img {...rest} />;
  },
}));

import { FeedCard } from "./feed-card";

const baseProps = {
  authorName: "민지",
  photoSignedUrl: "https://example.com/photo.jpg",
  summary: "오늘도 스쿼트 PR 갱신!",
  keywords: ["스쿼트", "PR도전"],
  kudosByEmoji: { "🔥": 3, "💪": 1, "👏": 0 } as const,
  participantCount: 4,
};

describe("FeedCard", () => {
  it("renders author, summary, and keywords", () => {
    render(<FeedCard {...baseProps} onKudos={() => {}} />);
    expect(screen.getByText("민지")).toBeTruthy();
    expect(screen.getByText("오늘도 스쿼트 PR 갱신!")).toBeTruthy();
    expect(screen.getByText("#스쿼트")).toBeTruthy();
    expect(screen.getByText("#PR도전")).toBeTruthy();
  });

  it("renders kudos counts per emoji", () => {
    render(<FeedCard {...baseProps} onKudos={() => {}} />);
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
  });

  it("invokes onKudos with the clicked emoji", () => {
    const onKudos = vi.fn();
    render(<FeedCard {...baseProps} onKudos={onKudos} />);
    const fireButton = screen.getAllByRole("button").find((b) => b.textContent?.includes("🔥"));
    if (!fireButton) throw new Error("🔥 button not found");
    fireEvent.click(fireButton);
    expect(onKudos).toHaveBeenCalledWith("🔥");
  });

  it("photo has meaningful alt text (not empty)", () => {
    render(<FeedCard {...baseProps} onKudos={() => {}} />);
    const img = screen.getByRole("img");
    const alt = img.getAttribute("alt") ?? "";
    expect(alt.length).toBeGreaterThan(0);
    expect(alt).toContain("민지");
  });

  it("omits the photo entirely when photoSignedUrl is null (mockup §8-A 자기 글 카드)", () => {
    render(<FeedCard {...baseProps} photoSignedUrl={null} onKudos={() => {}} />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders muted card + (나) suffix + 편집 link when isSelfAuthor (#25)", () => {
    render(<FeedCard {...baseProps} isSelfAuthor onKudos={() => {}} photoSignedUrl={null} />);
    expect(screen.getByText(/민지 \(나\)/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "편집" })).toBeTruthy();
  });

  it("renders DAY chip when dayNumber is provided", () => {
    render(<FeedCard {...baseProps} dayNumber={15} onKudos={() => {}} />);
    expect(screen.getByText("DAY 15")).toBeTruthy();
  });

  it("renders createdAtLabel (인증 시각) in the author row", () => {
    render(<FeedCard {...baseProps} createdAtLabel="3시간 전" onKudos={() => {}} />);
    expect(screen.getByText("3시간 전")).toBeTruthy();
  });

  it("marks viewer-pressed kudos via aria-pressed", () => {
    render(<FeedCard {...baseProps} viewerKudos={["🔥"]} onKudos={() => {}} />);
    expect(
      screen.getByRole("button", { name: /🔥 응원 3 · 내가 누름/ }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("does not render Kudos footer when participantCount === 1 (solo)", () => {
    render(<FeedCard {...baseProps} participantCount={1} onKudos={() => {}} />);
    expect(screen.queryByRole("button", { name: /응원/ })).toBeNull();
  });

  it("renders Kudos footer when participantCount >= 2 (group)", () => {
    render(<FeedCard {...baseProps} participantCount={2} onKudos={() => {}} />);
    expect(screen.getAllByRole("button", { name: /응원/ }).length).toBeGreaterThan(0);
  });
});

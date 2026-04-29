// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";

// next/image 는 jsdom 에서 remotePatterns 검증을 피하기 위해 plain img 로 스텁.
vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => {
    const { fill, ...rest } = props;
    void fill;
    // eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element -- rest includes alt; test-only mock
    return <img {...rest} />;
  },
}));

import { FeedCard } from "./feed-card";

const baseProps = {
  authorName: "민지",
  photoUrl: "https://example.com/photo.jpg",
  summary: "오늘도 스쿼트 PR 갱신!",
  keywords: ["스쿼트", "PR도전"],
  kudosByEmoji: { "🔥": 3, "💪": 1, "👏": 0 } as const,
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
    const fireButton = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("🔥"));
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
});

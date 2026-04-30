// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";

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

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));

const toggleMock = vi.fn();
vi.mock("../_actions", () => ({ toggleKudos: (...args: unknown[]) => toggleMock(...args) }));

import { ChallengeFeed } from "./challenge-feed";

const baseItem = {
  id: "00000000-0000-4000-8000-000000000001",
  authorId: "author-1",
  authorName: "민지",
  photoSignedUrl: "https://example.com/p.jpg",
  summary: "오늘도 해냈다.",
  keywords: ["펌핑"],
  kudosByEmoji: { "🔥": 2, "💪": 0, "👏": 0 } as const,
  viewerKudos: [] as const,
  createdAt: "2026-04-30T00:00:00Z",
};

describe("ChallengeFeed", () => {
  beforeEach(() => {
    toastError.mockReset();
    toggleMock.mockReset();
  });

  it("increments the emoji count immediately on click (optimistic)", async () => {
    toggleMock.mockResolvedValue({ ok: true, data: { toggled: "added" } });
    render(<ChallengeFeed items={[baseItem]} viewerId="viewer-1" />);
    const fireBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("🔥")) as HTMLButtonElement;
    fireEvent.click(fireBtn);
    expect(fireBtn.textContent).toContain("3");
    await waitFor(() => expect(toggleMock).toHaveBeenCalledTimes(1));
  });

  it("rolls back the count and surfaces an error toast when the action fails", async () => {
    toggleMock.mockResolvedValue({ ok: false, error: "forbidden" });
    render(<ChallengeFeed items={[baseItem]} viewerId="viewer-1" />);
    const fireBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("🔥")) as HTMLButtonElement;
    fireEvent.click(fireBtn);
    await waitFor(() => {
      expect(fireBtn.textContent).toContain("2");
      expect(toastError).toHaveBeenCalled();
    });
  });

  it("disables kudos buttons on the viewer's own log (RLS forbids self-kudos)", () => {
    const ownLog = { ...baseItem, authorId: "viewer-1" };
    render(<ChallengeFeed items={[ownLog]} viewerId="viewer-1" />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("renders an empty state when items is empty", () => {
    render(<ChallengeFeed items={[]} viewerId="viewer-1" />);
    expect(screen.getByText(/아직 인증이 없어요/)).toBeTruthy();
  });
});

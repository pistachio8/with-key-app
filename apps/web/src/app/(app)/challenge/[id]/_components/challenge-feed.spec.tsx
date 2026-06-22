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
const peerRejectMock = vi.fn();
vi.mock("../_actions", () => ({
  toggleKudos: (...args: unknown[]) => toggleMock(...args),
  togglePeerRejection: (...args: unknown[]) => peerRejectMock(...args),
}));

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
  peerRejectCount: 0,
  viewerRejected: false,
  isPeerRejected: false,
  createdAt: "2026-04-30T00:00:00Z",
  createdAtLabel: "4월 30일",
};

describe("ChallengeFeed", () => {
  beforeEach(() => {
    toastError.mockReset();
    toggleMock.mockReset();
    peerRejectMock.mockReset();
  });

  it("increments the emoji count immediately on click (optimistic)", async () => {
    toggleMock.mockResolvedValue({ ok: true, data: { toggled: "added" } });
    render(
      <ChallengeFeed items={[baseItem]} viewerId="viewer-1" participantCount={4} isEnded={false} />,
    );
    const fireBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("🔥")) as HTMLButtonElement;
    fireEvent.click(fireBtn);
    expect(fireBtn.textContent).toContain("3");
    await waitFor(() => expect(toggleMock).toHaveBeenCalledTimes(1));
  });

  it("rolls back the count and surfaces an error toast when the action fails", async () => {
    toggleMock.mockResolvedValue({ ok: false, error: "forbidden" });
    render(
      <ChallengeFeed items={[baseItem]} viewerId="viewer-1" participantCount={4} isEnded={false} />,
    );
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
    render(
      <ChallengeFeed items={[ownLog]} viewerId="viewer-1" participantCount={4} isEnded={false} />,
    );
    const kudosButtons = screen
      .getAllByRole("button")
      .filter((b) => /응원/.test(b.getAttribute("aria-label") ?? ""));
    expect(kudosButtons.length).toBeGreaterThan(0);
    for (const btn of kudosButtons) {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("🟨 peer-reject: optimistically bumps the anonymous count on click", async () => {
    peerRejectMock.mockResolvedValue({
      ok: true,
      data: { peerRejectCount: 1, viewerRejected: true, status: "passed" },
    });
    render(
      <ChallengeFeed items={[baseItem]} viewerId="viewer-1" participantCount={4} isEnded={false} />,
    );
    const rejectBtn = screen
      .getAllByRole("button")
      .find((b) => /반려/.test(b.getAttribute("aria-label") ?? "")) as HTMLButtonElement;
    expect(rejectBtn).toBeTruthy();
    fireEvent.click(rejectBtn);
    expect(rejectBtn.textContent).toContain("1");
    await waitFor(() => expect(peerRejectMock).toHaveBeenCalledTimes(1));
  });

  it("🟨 peer-reject: rolls back and toasts when the action fails (e.g. 48h window closed)", async () => {
    peerRejectMock.mockResolvedValue({ ok: false, error: "forbidden" });
    render(
      <ChallengeFeed items={[baseItem]} viewerId="viewer-1" participantCount={4} isEnded={false} />,
    );
    const rejectBtn = screen
      .getAllByRole("button")
      .find((b) => /반려/.test(b.getAttribute("aria-label") ?? "")) as HTMLButtonElement;
    fireEvent.click(rejectBtn);
    await waitFor(() => {
      expect(rejectBtn.textContent).toContain("0");
      expect(toastError).toHaveBeenCalled();
    });
  });

  it("🟨 peer-reject: hidden on the viewer's own log (cannot reject own action)", () => {
    const ownLog = { ...baseItem, authorId: "viewer-1" };
    render(
      <ChallengeFeed items={[ownLog]} viewerId="viewer-1" participantCount={4} isEnded={false} />,
    );
    const rejectButtons = screen
      .getAllByRole("button")
      .filter((b) => /반려/.test(b.getAttribute("aria-label") ?? ""));
    expect(rejectButtons.length).toBe(0);
  });

  it("🟨 peer-reject: 종료(isEnded) 후에도 활성 — kudos 는 비활성(48h 창 차별, RPC 가 시간창 강제)", async () => {
    peerRejectMock.mockResolvedValue({
      ok: true,
      data: { peerRejectCount: 1, viewerRejected: true, status: "passed" },
    });
    render(
      <ChallengeFeed items={[baseItem]} viewerId="viewer-1" participantCount={4} isEnded={true} />,
    );
    // kudos 는 종료 시 비활성
    const kudosButtons = screen
      .getAllByRole("button")
      .filter((b) => /응원/.test(b.getAttribute("aria-label") ?? ""));
    expect(kudosButtons.length).toBeGreaterThan(0);
    for (const btn of kudosButtons) expect((btn as HTMLButtonElement).disabled).toBe(true);
    // peer-reject 는 종료 후에도 활성·클릭 가능
    const rejectBtn = screen
      .getAllByRole("button")
      .find((b) => /반려/.test(b.getAttribute("aria-label") ?? "")) as HTMLButtonElement;
    expect(rejectBtn).toBeTruthy();
    expect(rejectBtn.disabled).toBe(false);
    fireEvent.click(rejectBtn);
    await waitFor(() => expect(peerRejectMock).toHaveBeenCalledTimes(1));
  });

  it("renders an empty state when items is empty", () => {
    render(<ChallengeFeed items={[]} viewerId="viewer-1" participantCount={1} isEnded={false} />);
    expect(screen.getByText(/아직 인증이 없어요/)).toBeTruthy();
  });
});

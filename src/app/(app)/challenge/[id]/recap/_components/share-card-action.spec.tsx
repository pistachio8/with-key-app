// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShareCardAction } from "./share-card-action";

describe("ShareCardAction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(new Blob(["png"], { type: "image/png" }), { status: 200 }),
    );
  });

  it("[결과 공유] 버튼 클릭 시 navigator.share 호출", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, "share", { value: share, configurable: true });
    render(<ShareCardAction challengeId="c1" shareMessage="hello" />);
    fireEvent.click(screen.getByRole("button", { name: "결과 공유" }));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({ title: "with-key 결과", text: "hello" }),
    );
  });

  it("[공유 카드 저장] 버튼 클릭 시 /api/og/recap-card fetch", async () => {
    render(<ShareCardAction challengeId="c1" shareMessage="x" />);
    fireEvent.click(screen.getByRole("button", { name: "공유 카드 저장" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/og/recap-card?challengeId=c1"),
    );
  });
});

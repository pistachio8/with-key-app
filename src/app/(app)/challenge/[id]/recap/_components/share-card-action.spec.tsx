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

  it("navigator.share 미정의 시 navigator.clipboard.writeText 호출", async () => {
    Object.defineProperty(global.navigator, "share", { value: undefined, configurable: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<ShareCardAction challengeId="c1" shareMessage="msg" />);
    fireEvent.click(screen.getByRole("button", { name: "결과 공유" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("msg"));
  });

  it("AbortError 는 무시 — toast.error 호출 안 함", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));
    Object.defineProperty(global.navigator, "share", { value: share, configurable: true });
    Object.defineProperty(global.navigator, "canShare", {
      value: () => true,
      configurable: true,
    });
    const { toast } = await import("sonner");
    const errSpy = vi.spyOn(toast, "error");
    render(<ShareCardAction challengeId="c1" shareMessage="x" />);
    fireEvent.click(screen.getByRole("button", { name: "공유 카드 저장" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("Web Share files 미지원 시 a[download] 폴백 + URL.revokeObjectURL 호출", async () => {
    Object.defineProperty(global.navigator, "canShare", { value: () => false, configurable: true });
    // jsdom 에는 URL.createObjectURL / revokeObjectURL 이 없으므로 직접 주입
    if (!URL.createObjectURL) {
      URL.createObjectURL = () => "blob:fake";
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = () => undefined;
    }
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    render(<ShareCardAction challengeId="c1" shareMessage="x" />);
    fireEvent.click(screen.getByRole("button", { name: "공유 카드 저장" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:fake"));
  });
});

// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShareCardAction } from "./share-card-action";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

describe("ShareCardAction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    toastError.mockReset();
    Object.defineProperty(global.navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(global.navigator, "canShare", { value: undefined, configurable: true });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(new Blob(["png"], { type: "image/png" }), { status: 200 }),
    );
  });

  it("기본(영상) 공유 시 recap-clip URL fetch + navigator.share files", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, "share", { value: share, configurable: true });
    Object.defineProperty(global.navigator, "canShare", { value: () => true, configurable: true });
    render(<ShareCardAction challengeId="c1" shareMessage="msg" />);
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/share/recap-clip?challengeId=c1"),
    );
    await waitFor(() => expect(share).toHaveBeenCalled());
  });

  it("사진형 토글 후 공유 시 template=photo URL fetch", async () => {
    Object.defineProperty(global.navigator, "canShare", { value: () => false, configurable: true });
    if (!URL.createObjectURL) URL.createObjectURL = () => "blob:fake";
    if (!URL.revokeObjectURL) URL.revokeObjectURL = () => undefined;
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    render(<ShareCardAction challengeId="c1" shareMessage="x" />);
    fireEvent.click(screen.getByRole("tab", { name: "사진형" }));
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/og/recap-card?challengeId=c1&template=photo"),
    );
  });

  it("티켓형 토글 후 공유 시 template=ticket URL fetch", async () => {
    Object.defineProperty(global.navigator, "canShare", { value: () => false, configurable: true });
    if (!URL.createObjectURL) URL.createObjectURL = () => "blob:fake";
    if (!URL.revokeObjectURL) URL.revokeObjectURL = () => undefined;
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    render(<ShareCardAction challengeId="c1" shareMessage="x" />);
    fireEvent.click(screen.getByRole("tab", { name: "티켓형" }));
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/og/recap-card?challengeId=c1&template=ticket",
      ),
    );
  });

  it("Web Share files 미지원 시 a[download] 폴백 + URL.revokeObjectURL 호출", async () => {
    Object.defineProperty(global.navigator, "canShare", { value: () => false, configurable: true });
    if (!URL.createObjectURL) URL.createObjectURL = () => "blob:fake";
    if (!URL.revokeObjectURL) URL.revokeObjectURL = () => undefined;
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    render(<ShareCardAction challengeId="c1" shareMessage="x" />);
    fireEvent.click(screen.getByRole("tab", { name: "사진형" }));
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:fake"));
  });

  it("share 취소(AbortError) 시 toast.error 호출 안 함", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));
    Object.defineProperty(global.navigator, "share", { value: share, configurable: true });
    Object.defineProperty(global.navigator, "canShare", { value: () => true, configurable: true });
    render(<ShareCardAction challengeId="c1" shareMessage="x" />);
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(toastError).not.toHaveBeenCalled();
  });
});

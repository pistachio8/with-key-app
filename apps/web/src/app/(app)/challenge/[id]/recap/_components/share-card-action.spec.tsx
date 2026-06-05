// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShareCardAction } from "./share-card-action";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

describe("ShareCardAction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    toastError.mockReset();
    Object.defineProperty(global.navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(global.navigator, "canShare", { value: undefined, configurable: true });
    Object.defineProperty(URL, "createObjectURL", {
      value: vi.fn(() => "blob:fake"),
      configurable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(new Blob(["png"], { type: "image/png" }), { status: 200 }),
    );
  });

  it("형식 3개 radio + 기본 선택 티켓", () => {
    render(<ShareCardAction challengeId="c1" shareMessage="msg" seed={1} />);
    const group = screen.getByRole("radiogroup", { name: "공유 형식" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "티켓" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "사진" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "영상" })).toHaveAttribute("aria-checked", "false");
  });

  it("공유 버튼은 단일 + 접근명 '공유하기'", () => {
    render(<ShareCardAction challengeId="c1" shareMessage="msg" seed={1} />);
    expect(screen.getByRole("button", { name: "공유하기" })).toBeTruthy();
  });

  it("영상 선택 후 공유 시 recap-clip URL(seed) fetch + navigator.share files", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, "share", { value: share, configurable: true });
    Object.defineProperty(global.navigator, "canShare", { value: () => true, configurable: true });
    render(<ShareCardAction challengeId="c1" shareMessage="msg" seed={1} />);
    fireEvent.click(screen.getByRole("radio", { name: "영상" }));
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/share/recap-clip?challengeId=c1&seed=1"),
    );
    await waitFor(() => expect(share).toHaveBeenCalled());
  });

  it("사진 선택 후 공유 시 template=photo&seed URL fetch (다운로드 폴백)", async () => {
    Object.defineProperty(global.navigator, "canShare", { value: () => false, configurable: true });
    render(<ShareCardAction challengeId="c1" shareMessage="x" seed={1} />);
    fireEvent.click(screen.getByRole("radio", { name: "사진" }));
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/og/recap-card?challengeId=c1&template=photo&seed=1",
      ),
    );
  });

  it("티켓(기본) 공유 시 template=ticket&seed URL fetch", async () => {
    Object.defineProperty(global.navigator, "canShare", { value: () => false, configurable: true });
    render(<ShareCardAction challengeId="c1" shareMessage="x" seed={1} />);
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/og/recap-card?challengeId=c1&template=ticket&seed=1",
      ),
    );
  });

  it("Web Share files 미지원 시 a[download] 폴백 + URL.revokeObjectURL 호출", async () => {
    Object.defineProperty(global.navigator, "canShare", { value: () => false, configurable: true });
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    render(<ShareCardAction challengeId="c1" shareMessage="x" seed={1} />);
    fireEvent.click(screen.getByRole("radio", { name: "사진" }));
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:fake"));
  });

  it("share 취소(AbortError) 시 toast.error 호출 안 함", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));
    Object.defineProperty(global.navigator, "share", { value: share, configurable: true });
    Object.defineProperty(global.navigator, "canShare", { value: () => true, configurable: true });
    render(<ShareCardAction challengeId="c1" shareMessage="x" seed={1} />);
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(toastError).not.toHaveBeenCalled();
  });

  it("미리보기: 기본은 티켓(template=ticket&seed) 이미지 + lazy", () => {
    render(<ShareCardAction challengeId="c1" shareMessage="x" seed={1} />);
    const img = screen.getByAltText("티켓형 공유 카드 미리보기");
    expect(img.getAttribute("src")).toContain("challengeId=c1");
    expect(img.getAttribute("src")).toContain("template=ticket");
    expect(img.getAttribute("src")).toContain("seed=1");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("미리보기: 로딩 중 선택 이미지가 hidden(display:none) 아님 — lazy+hidden 데드락 방지", () => {
    render(<ShareCardAction challengeId="c1" shareMessage="x" seed={1} />);
    const img = screen.getByAltText("티켓형 공유 카드 미리보기");
    expect(img.className).not.toContain("hidden");
  });

  it("미리보기: 로드 전 스켈레톤 노출", () => {
    render(<ShareCardAction challengeId="c1" shareMessage="x" seed={1} />);
    expect(screen.getByTestId("share-preview-skeleton")).toBeTruthy();
  });

  it("미리보기: 영상 선택 시 로드 후 MP4 배지", () => {
    render(<ShareCardAction challengeId="c1" shareMessage="x" seed={1} />);
    fireEvent.click(screen.getByRole("radio", { name: "영상" }));
    fireEvent.load(screen.getByAltText("사진형 공유 카드 미리보기"));
    expect(screen.getByText("MP4")).toBeTruthy();
  });

  it("미리보기: 티켓 기본은 template=ticket 이미지 · MP4 배지 없음", () => {
    render(<ShareCardAction challengeId="c1" shareMessage="x" seed={1} />);
    const img = screen.getByAltText("티켓형 공유 카드 미리보기");
    expect(img.getAttribute("src")).toContain("template=ticket");
    expect(screen.queryByText("MP4")).toBeNull();
  });

  it("미리보기: 로드 실패 시 fallback 문구 표시", () => {
    render(<ShareCardAction challengeId="c1" shareMessage="x" seed={1} />);
    fireEvent.error(screen.getByAltText("티켓형 공유 카드 미리보기"));
    expect(screen.getByText("미리보기를 불러오지 못했어요")).toBeTruthy();
  });
});

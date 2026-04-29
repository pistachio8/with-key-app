// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// qrcode 는 CJS module — default import 가 namespace 전체를 받으므로 named export 도 함께 stub.
vi.mock("qrcode", () => {
  const toDataURL = vi.fn().mockResolvedValue("data:image/png;base64,stub");
  return {
    default: { toDataURL },
    toDataURL,
  };
});

import { SettlementSheet } from "./settlement-sheet";

const ORIGINAL_URL = process.env.NEXT_PUBLIC_KAKAOPAY_SEND_URL;

describe("SettlementSheet", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_KAKAOPAY_SEND_URL = "https://qr.kakaopay.com/abc";
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_KAKAOPAY_SEND_URL = ORIGINAL_URL;
    // NOTE: restoreAllMocks 는 vi.mock 내 mockResolvedValue 도 재설정해서 후속 테스트에서
    // toDataURL 이 undefined 를 반환함 → clearAllMocks 로 call history 만 비움.
    vi.clearAllMocks();
  });

  it("shows amount + link + send button when open", async () => {
    render(
      <SettlementSheet
        open
        onOpenChange={() => {}}
        amount={3000}
        memo="주 3회 헬스장 벌금"
      />,
    );
    expect(screen.getByText(/3,000/)).toBeTruthy();
    const link = await screen.findByRole("link", { name: /카카오페이로 보내기/ });
    expect(link.getAttribute("href")).toContain("amount=3000");
  });

  it("copies link to clipboard when 링크 복사 clicked", async () => {
    render(<SettlementSheet open onOpenChange={() => {}} amount={3000} />);
    fireEvent.click(screen.getByRole("button", { name: /링크 복사/ }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("amount=3000"),
      );
    });
  });

  it("send link has target=_blank and rel=noopener for external navigation", async () => {
    render(<SettlementSheet open onOpenChange={() => {}} amount={3000} />);
    const link = await screen.findByRole("link", { name: /카카오페이로 보내기/ });
    expect(link.getAttribute("href")).toContain("amount=3000");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});

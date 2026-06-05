// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const revealMock = vi.fn();
vi.mock("../_actions", () => ({
  revealAccountNumber: (...args: unknown[]) => revealMock(...args),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

import { AccountInfoSheet } from "./account-info-sheet";

const GROUP_ID = "22222222-2222-4222-8222-222222222222";

// iOS 경로 검증용 — 실제 ClipboardItem 은 jsdom 에 없으므로 Promise<Blob> 값을 보관만 한다.
class FakeClipboardItem {
  readonly items: Record<string, Promise<Blob>>;
  constructor(items: Record<string, Promise<Blob>>) {
    this.items = items;
  }
}

function installClipboardItem(): void {
  (globalThis as unknown as { ClipboardItem: unknown }).ClipboardItem = FakeClipboardItem;
}
function uninstallClipboardItem(): void {
  delete (globalThis as unknown as { ClipboardItem?: unknown }).ClipboardItem;
}

const FILLED = {
  groupId: GROUP_ID,
  bankCode: "088",
  accountHolder: "홍길동",
  accountNumberLast4: "5678",
};

const EMPTY = {
  groupId: GROUP_ID,
  bankCode: null,
  accountHolder: null,
  accountNumberLast4: null,
};

describe("AccountInfoSheet", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });
  afterEach(() => {
    revealMock.mockReset();
    toastSuccess.mockClear();
    toastError.mockClear();
    uninstallClipboardItem();
  });

  it("renders masked last4 and bank/holder when account is registered", () => {
    render(<AccountInfoSheet open onOpenChange={() => {}} {...FILLED} />);
    expect(screen.getByText("****-**-****5678")).toBeTruthy();
    // Bank code 088 → 신한 (from BANK_NAMES)
    expect(screen.getByText(/신한.*홍길동/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /계좌번호 복사/ }).hasAttribute("disabled")).toBe(
      false,
    );
  });

  it("copies plaintext returned from revealAccountNumber to clipboard", async () => {
    const plain = "11012345678";
    revealMock.mockResolvedValueOnce({ ok: true, data: { accountNumber: plain } });

    render(<AccountInfoSheet open onOpenChange={() => {}} {...FILLED} />);
    fireEvent.click(screen.getByRole("button", { name: /계좌번호 복사/ }));

    await waitFor(() => {
      expect(revealMock).toHaveBeenCalledWith({ groupId: GROUP_ID });
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(plain);
      expect(toastSuccess).toHaveBeenCalledWith("계좌번호가 복사되었어요");
    });
  });

  it("shows user-friendly error when action returns not_found", async () => {
    revealMock.mockResolvedValueOnce({ ok: false, error: "not_found" });
    render(<AccountInfoSheet open onOpenChange={() => {}} {...FILLED} />);
    fireEvent.click(screen.getByRole("button", { name: /계좌번호 복사/ }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        expect.stringContaining("오너가 아직 계좌를 등록하지 않았어요"),
      );
    });
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("disables copy button and shows empty-state when no account registered", () => {
    render(<AccountInfoSheet open onOpenChange={() => {}} {...EMPTY} />);
    expect(screen.getByText(/오너가 아직 계좌를 등록하지 않았어요/)).toBeTruthy();
    const button = screen.getByRole("button", { name: /계좌번호 복사/ });
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("shows fallback error toast when revealAccountNumber throws (action 실패)", async () => {
    revealMock.mockRejectedValueOnce(new Error("network down"));
    render(<AccountInfoSheet open onOpenChange={() => {}} {...FILLED} />);
    fireEvent.click(screen.getByRole("button", { name: /계좌번호 복사/ }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(expect.stringContaining("요청을 처리하지 못했어요"));
    });
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  describe("ClipboardItem path (iOS Safari/PWA)", () => {
    beforeEach(() => {
      installClipboardItem();
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined),
          // 실제 clipboard.write 처럼 ClipboardItem 의 Promise<Blob> 들을 await —
          // blob 이 reject 하면 write 도 reject (reveal 실패 전파 검증을 위해 필수).
          write: vi.fn(async (items: FakeClipboardItem[]) => {
            await Promise.all(items.flatMap((it) => Object.values(it.items)));
          }),
        },
      });
    });

    it("copies plaintext via navigator.clipboard.write, not writeText", async () => {
      const plain = "11012345678";
      revealMock.mockResolvedValueOnce({ ok: true, data: { accountNumber: plain } });

      render(<AccountInfoSheet open onOpenChange={() => {}} {...FILLED} />);
      fireEvent.click(screen.getByRole("button", { name: /계좌번호 복사/ }));

      await waitFor(() => {
        expect(navigator.clipboard.write).toHaveBeenCalledTimes(1);
        expect(toastSuccess).toHaveBeenCalledWith("계좌번호가 복사되었어요");
      });
      // 제스처 보존 경로이므로 writeText 는 쓰이지 않는다.
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();

      // ClipboardItem 에 담긴 Promise<Blob> 이 실제 평문을 보유하는지 확인.
      // jsdom 의 Blob 은 .text() 미구현이라 FileReader 로 읽는다.
      const writeMock = navigator.clipboard.write as unknown as ReturnType<typeof vi.fn>;
      const item = writeMock.mock.calls[0][0][0] as FakeClipboardItem;
      const blob = await item.items["text/plain"];
      const textContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
      });
      expect(textContent).toBe(plain);
    });

    it("shows clipboard-failure toast when write rejects", async () => {
      revealMock.mockResolvedValueOnce({ ok: true, data: { accountNumber: "11012345678" } });
      Object.assign(navigator.clipboard, {
        write: vi.fn().mockRejectedValue(new Error("NotAllowedError")),
      });

      render(<AccountInfoSheet open onOpenChange={() => {}} {...FILLED} />);
      fireEvent.click(screen.getByRole("button", { name: /계좌번호 복사/ }));

      await waitFor(() => {
        expect(toastError).toHaveBeenCalledWith(expect.stringContaining("복사에 실패했어요"));
      });
      expect(toastSuccess).not.toHaveBeenCalled();
    });

    it("maps reveal not_found to user message even on the ClipboardItem path", async () => {
      revealMock.mockResolvedValueOnce({ ok: false, error: "not_found" });

      render(<AccountInfoSheet open onOpenChange={() => {}} {...FILLED} />);
      fireEvent.click(screen.getByRole("button", { name: /계좌번호 복사/ }));

      await waitFor(() => {
        expect(toastError).toHaveBeenCalledWith(
          expect.stringContaining("오너가 아직 계좌를 등록하지 않았어요"),
        );
      });
    });
  });
});

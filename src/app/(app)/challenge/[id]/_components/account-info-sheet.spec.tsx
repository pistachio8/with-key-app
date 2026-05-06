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
  });

  it("renders masked last4 and bank/holder when account is registered", () => {
    render(<AccountInfoSheet open onOpenChange={() => {}} {...FILLED} />);
    expect(screen.getByText("****-**-****5678")).toBeTruthy();
    // Bank code 088 → 신한 (from BANK_NAMES)
    expect(screen.getByText(/신한.*홍길동/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /계좌번호 복사/ }).hasAttribute("disabled"),
    ).toBe(false);
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
});

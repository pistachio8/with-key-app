// src/app/(app)/group/[id]/_components/invite-trigger.spec.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { InviteTrigger } from "./invite-trigger";

const createInviteMock = vi.fn();
vi.mock("../_actions", () => ({
  createInvite: (groupId: string) => createInviteMock(groupId),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (m: string) => toastSuccess(m),
    error: (m: string) => toastError(m),
  },
}));

const writeText = vi.fn();
beforeEach(() => {
  createInviteMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  writeText.mockReset();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: (t: string) => writeText(t) },
  });
  // Force fallback-to-clipboard path: share is intentionally undefined.
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const GROUP_ID = "22222222-2222-4222-8222-222222222222";

describe("<InviteTrigger />", () => {
  it("copies invite URL on success and shows toast", async () => {
    createInviteMock.mockResolvedValueOnce({ ok: true, data: { token: "ABC" } });

    render(<InviteTrigger groupId={GROUP_ID} />);
    fireEvent.click(screen.getByRole("button", { name: "친구 초대 링크 공유" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    expect(writeText.mock.calls[0]![0]).toContain("/invite/ABC");
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("shows error toast on forbidden", async () => {
    createInviteMock.mockResolvedValueOnce({ ok: false, error: "forbidden" });

    render(<InviteTrigger groupId={GROUP_ID} />);
    fireEvent.click(screen.getByRole("button", { name: "친구 초대 링크 공유" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    expect(writeText).not.toHaveBeenCalled();
  });
});

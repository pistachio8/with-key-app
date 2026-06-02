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
  it("copies invite message + URL separated by a blank line, and shows toast", async () => {
    createInviteMock.mockResolvedValueOnce({ ok: true, data: { token: "ABC" } });

    render(<InviteTrigger groupId={GROUP_ID} />);
    fireEvent.click(screen.getByRole("button", { name: "친구 초대 링크 공유" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const copied = writeText.mock.calls[0]![0] as string;
    expect(copied).toContain("함께 운동 서약서를 써볼래?");
    expect(copied).toContain("/invite/ABC");
    // 메시지와 URL 사이 빈 줄(개행 2개) — 카톡 등에 plain text 로 들어갈 때 줄바꿈을 강제.
    expect(copied).toMatch(/함께 운동 서약서를 써볼래\?\n\nhttps?:\/\/[^\s]*\/invite\/ABC$/);
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("uses Web Share API with bundled text (no separate url field) when available", async () => {
    createInviteMock.mockResolvedValueOnce({ ok: true, data: { token: "XYZ" } });
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: shareSpy,
    });

    render(<InviteTrigger groupId={GROUP_ID} />);
    fireEvent.click(screen.getByRole("button", { name: "친구 초대 링크 공유" }));

    await waitFor(() => {
      expect(shareSpy).toHaveBeenCalledTimes(1);
    });
    const payload = shareSpy.mock.calls[0]![0] as { title: string; text: string; url?: string };
    expect(payload.title).toBe("from.with 초대");
    expect(payload.text).toMatch(/함께 운동 서약서를 써볼래\?\n\nhttps?:\/\/[^\s]*\/invite\/XYZ$/);
    // url 필드를 따로 두면 OS 가 "text url" 한 줄로 join 해버려 줄바꿈이 사라진다 — text 에 묶고 url 은 빼야 한다.
    expect(payload.url).toBeUndefined();
    // share 가 성공하면 clipboard fallback 으로 넘어가지 않는다.
    expect(writeText).not.toHaveBeenCalled();
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

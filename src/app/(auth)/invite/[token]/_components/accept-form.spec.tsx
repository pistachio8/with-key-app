import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AcceptForm } from "./accept-form";

const acceptInviteMock = vi.fn();
vi.mock("../_actions", () => ({
  acceptInvite: (token: string) => acceptInviteMock(token),
}));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (m: string) => toastError(m),
    success: (_: string) => {},
  },
}));

beforeEach(() => {
  acceptInviteMock.mockReset();
  pushMock.mockReset();
  toastError.mockReset();
});

describe("<AcceptForm />", () => {
  it("on success, pushes to /pledge so the user can sign the pledge", async () => {
    acceptInviteMock.mockResolvedValueOnce({
      ok: true,
      data: { groupId: "22222222-2222-4222-8222-222222222222" },
    });

    render(<AcceptForm token="TOK" groupName="민지네" isAuthed={true} />);
    fireEvent.click(screen.getByRole("button", { name: "참여하기" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/pledge"));
  });

  it("on not_found, shows expired-friendly error and does not navigate", async () => {
    acceptInviteMock.mockResolvedValueOnce({ ok: false, error: "not_found" });

    render(<AcceptForm token="TOK" groupName="민지네" isAuthed={true} />);
    fireEvent.click(screen.getByRole("button", { name: "참여하기" }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0]![0]).toMatch(/만료|다시|유효/);
    expect(pushMock).not.toHaveBeenCalled();
  });

  // spec 2026-05-17-invite-og-preview C2 — 익명(cold-land) 진입은 미리보기만 보여주고
  // 수락 액션은 로그인 게이트로 라우팅. acceptInvite 는 호출되지 않아야 한다.
  it("when not authed, shows login CTA and routes to /login with next param on click", () => {
    render(<AcceptForm token="TOK-123" groupName="민지네" isAuthed={false} />);

    expect(screen.queryByRole("button", { name: "참여하기" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "로그인하고 참여하기" }));

    expect(pushMock).toHaveBeenCalledWith(`/login?next=${encodeURIComponent("/invite/TOK-123")}`);
    expect(acceptInviteMock).not.toHaveBeenCalled();
  });
});

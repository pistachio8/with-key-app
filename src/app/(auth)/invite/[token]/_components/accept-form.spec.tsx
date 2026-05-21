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

const toastFn = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => {
  const toast = Object.assign((title: string, options?: unknown) => toastFn(title, options), {
    error: (m: string) => toastError(m),
    success: () => {},
  });
  return { toast };
});

beforeEach(() => {
  acceptInviteMock.mockReset();
  pushMock.mockReset();
  toastError.mockReset();
  toastFn.mockReset();
});

describe("<AcceptForm />", () => {
  it("on success, pushes to the server-selected invite destination", async () => {
    acceptInviteMock.mockResolvedValueOnce({
      ok: true,
      data: {
        groupId: "22222222-2222-4222-8222-222222222222",
        redirectTo: "/challenge/33333333-3333-4333-8333-333333333333/pledge",
        notifPromptRequired: false,
      },
    });

    render(<AcceptForm token="TOK" groupName="민지네" isAuthed={true} />);
    fireEvent.click(screen.getByRole("button", { name: "참여하기" }));

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(
        "/challenge/33333333-3333-4333-8333-333333333333/pledge",
      ),
    );
    expect(toastFn).not.toHaveBeenCalled();
  });

  it("on not_found, shows expired-friendly error and does not navigate", async () => {
    acceptInviteMock.mockResolvedValueOnce({ ok: false, error: "not_found" });

    render(<AcceptForm token="TOK" groupName="민지네" isAuthed={true} />);
    fireEvent.click(screen.getByRole("button", { name: "참여하기" }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0]![0]).toMatch(/만료|다시|유효/);
    expect(pushMock).not.toHaveBeenCalled();
  });

  // ADR-0013 — server 가 prefs.start=false 신호를 주면 toast 로 /me 토글 ON 안내.
  it("shows notif opt-in toast when server signals notifPromptRequired", async () => {
    acceptInviteMock.mockResolvedValueOnce({
      ok: true,
      data: {
        groupId: "22222222-2222-4222-8222-222222222222",
        redirectTo: "/challenge/33333333-3333-4333-8333-333333333333/pledge",
        notifPromptRequired: true,
      },
    });

    render(<AcceptForm token="TOK" groupName="민지네" isAuthed={true} />);
    fireEvent.click(screen.getByRole("button", { name: "참여하기" }));

    await waitFor(() => expect(toastFn).toHaveBeenCalled());
    const [title, options] = toastFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(title).toMatch(/알림/);
    const action = options.action as { label: string; onClick: () => void };
    expect(action.label).toMatch(/설정/);

    action.onClick();
    expect(pushMock).toHaveBeenCalledWith("/me");
    expect(pushMock).toHaveBeenCalledWith("/challenge/33333333-3333-4333-8333-333333333333/pledge");
  });

  it("does not show notif toast when notifPromptRequired is false", async () => {
    acceptInviteMock.mockResolvedValueOnce({
      ok: true,
      data: {
        groupId: "22222222-2222-4222-8222-222222222222",
        redirectTo: "/challenge/33333333-3333-4333-8333-333333333333/pledge",
        notifPromptRequired: false,
      },
    });

    render(<AcceptForm token="TOK" groupName="민지네" isAuthed={true} />);
    fireEvent.click(screen.getByRole("button", { name: "참여하기" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    expect(toastFn).not.toHaveBeenCalled();
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

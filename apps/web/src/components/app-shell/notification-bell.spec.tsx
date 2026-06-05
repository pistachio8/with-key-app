// @vitest-environment jsdom
import { render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const unreadCountMock = vi.fn<() => Promise<number>>();
const pathnameMock = vi.fn<() => string>(() => "/home");

vi.mock("@/lib/notifications/store", () => ({
  unreadCount: () => unreadCountMock(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
}));

import { NotificationBell } from "./notification-bell";

describe("NotificationBell", () => {
  beforeEach(() => {
    unreadCountMock.mockReset();
    unreadCountMock.mockResolvedValue(0);
    pathnameMock.mockReturnValue("/home");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("마운트 시 unreadCount 호출 → 0 이면 dot opacity-0 + 기본 라벨", async () => {
    unreadCountMock.mockResolvedValue(0);
    render(<NotificationBell />);
    await waitFor(() => expect(unreadCountMock).toHaveBeenCalled());
    const dot = screen.getByTestId("header-unread-dot");
    expect(dot.className).toContain("opacity-0");
    expect(screen.getByRole("link", { name: "알림" })).toBeTruthy();
  });

  it("unreadCount > 0 이면 dot opacity-100 + 라벨 '알림 (새 알림 있음)'", async () => {
    unreadCountMock.mockResolvedValue(3);
    render(<NotificationBell />);
    await waitFor(() => {
      const link = screen.getByRole("link", { name: "알림 (새 알림 있음)" });
      expect(link).toBeTruthy();
    });
    const dot = screen.getByTestId("header-unread-dot");
    expect(dot.className).toContain("opacity-100");
  });

  it("link href 는 항상 /notifications", async () => {
    unreadCountMock.mockResolvedValue(0);
    render(<NotificationBell />);
    await waitFor(() => expect(unreadCountMock).toHaveBeenCalled());
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/notifications");
  });

  it("visibilitychange (visible) 발생 시 unreadCount 재호출", async () => {
    unreadCountMock.mockResolvedValue(0);
    render(<NotificationBell />);
    await waitFor(() => expect(unreadCountMock).toHaveBeenCalledTimes(1));

    unreadCountMock.mockResolvedValue(1);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(unreadCountMock).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("header-unread-dot").className).toContain("opacity-100");
  });

  it("visibilitychange (hidden) 면 재호출 없음", async () => {
    unreadCountMock.mockResolvedValue(0);
    render(<NotificationBell />);
    await waitFor(() => expect(unreadCountMock).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(unreadCountMock).toHaveBeenCalledTimes(1);
  });
});

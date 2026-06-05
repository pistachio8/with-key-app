// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { AppHeader } from "./app-header";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/home",
}));

vi.mock("@/lib/notifications/store", () => ({
  unreadCount: () => Promise.resolve(0),
}));

describe("AppHeader", () => {
  it("좌측 로고 링크가 /home 으로 이동하고 aria-label='홈'", () => {
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: "홈" }).getAttribute("href")).toBe("/home");
  });

  it("우측 컨테이너의 아이콘 순서는 알림 → 마이페이지 (그룹은 FAB로 이동)", () => {
    const { container } = render(<AppHeader />);
    const rightCluster = container.querySelector("header div.flex.items-center.gap-1");
    expect(rightCluster).not.toBeNull();
    const labels = Array.from((rightCluster as HTMLElement).querySelectorAll("a,button")).map(
      (el) => el.getAttribute("aria-label") ?? "",
    );
    expect(labels).toEqual(["알림", "마이페이지"]);
  });

  it("그룹 관련 아이콘은 헤더에 없음", () => {
    render(<AppHeader />);
    expect(screen.queryByRole("button", { name: "그룹 선택" })).toBeNull();
    expect(screen.queryByRole("link", { name: "새 그룹 만들기" })).toBeNull();
  });

  it("알림 링크는 /notifications, 마이페이지는 /me", () => {
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: "알림" }).getAttribute("href")).toBe("/notifications");
    expect(screen.getByRole("link", { name: "마이페이지" }).getAttribute("href")).toBe("/me");
  });
});

// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { AppHeader } from "./app-header";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe("AppHeader", () => {
  it("좌측 로고 링크가 /home 으로 이동하고 aria-label='홈'", () => {
    render(<AppHeader />);
    const homeLink = screen.getByRole("link", { name: "홈" });
    expect(homeLink.getAttribute("href")).toBe("/home");
  });

  it("우측 컨테이너의 아이콘 순서는 알림 → 그룹 → 마이페이지", () => {
    const { container } = render(<AppHeader />);
    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    const rightCluster = header!.querySelector("div.flex.items-center.gap-1");
    expect(rightCluster).not.toBeNull();

    const labels = Array.from((rightCluster as HTMLElement).querySelectorAll("a,button")).map(
      (el) => el.getAttribute("aria-label") ?? "",
    );
    expect(labels).toEqual(["알림", "새 그룹 만들기", "마이페이지"]);
  });

  it("그룹 0개면 그룹 아이콘이 /group/new 링크 + '새 그룹 만들기' 라벨", () => {
    render(<AppHeader />);
    const link = screen.getByRole("link", { name: "새 그룹 만들기" });
    expect(link.getAttribute("href")).toBe("/group/new");
  });

  it("그룹 1개면 그룹 아이콘이 sheet 트리거 버튼 + '그룹 선택' 라벨", () => {
    render(<AppHeader groups={[{ id: "g1", name: "러닝 크루" }]} />);
    const btn = screen.getByRole("button", { name: "그룹 선택" });
    expect(btn.getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("그룹 1개에 이름이 null 이어도 sheet 트리거 버튼을 렌더", () => {
    render(<AppHeader groups={[{ id: "g1", name: null }]} />);
    const btn = screen.getByRole("button", { name: "그룹 선택" });
    expect(btn.getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("그룹 2개+면 그룹 아이콘이 sheet 트리거 버튼 + '그룹 선택' 라벨", () => {
    render(
      <AppHeader
        groups={[
          { id: "g1", name: "러닝 크루" },
          { id: "g2", name: "헬스 메이트" },
        ]}
      />,
    );
    const btn = screen.getByRole("button", { name: "그룹 선택" });
    expect(btn.getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("unreadNotifications=false 이면 dot 미렌더 + 기본 알림 라벨", () => {
    render(<AppHeader unreadNotifications={false} />);
    expect(screen.queryByTestId("header-unread-dot")).toBeNull();
    expect(screen.getByRole("link", { name: "알림" })).toBeTruthy();
  });

  it("unreadNotifications=true 이면 dot + 확장된 알림 라벨", () => {
    render(<AppHeader unreadNotifications={true} />);
    expect(screen.getByTestId("header-unread-dot")).toBeTruthy();
    expect(screen.getByRole("link", { name: "알림 (새 응원 있음)" })).toBeTruthy();
  });

  it("마이페이지 링크는 /me 로 이동", () => {
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: "마이페이지" }).getAttribute("href")).toBe("/me");
  });
});

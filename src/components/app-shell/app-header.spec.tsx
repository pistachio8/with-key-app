// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { AppHeader } from "./app-header";

describe("AppHeader", () => {
  it("그룹 0개면 라벨이 텍스트로만 표시", () => {
    render(<AppHeader />);
    expect(screen.getByText("from. with")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /from\. with/ })).toBeNull();
    expect(screen.getByRole("link", { name: "알림" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "마이페이지" })).toBeTruthy();
  });

  it("그룹 1개면 라벨이 해당 그룹으로 직접 링크", () => {
    render(<AppHeader groups={[{ id: "g1", name: "러닝 크루" }]} />);
    const groupLink = screen.getByRole("link", { name: /러닝 크루/ });
    expect(groupLink).toBeTruthy();
    expect(groupLink.getAttribute("href")).toBe("/group/g1");
  });

  it("그룹 2개+면 sheet 트리거 버튼이 노출", () => {
    render(
      <AppHeader
        groups={[
          { id: "g1", name: "러닝 크루" },
          { id: "g2", name: "헬스 메이트" },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: /from\. with/ })).toBeTruthy();
  });

  it("unreadNotifications=false 이면 dot 미렌더 + 기본 aria-label", () => {
    render(<AppHeader unreadNotifications={false} />);
    expect(screen.queryByTestId("header-unread-dot")).toBeNull();
    expect(screen.getByRole("link", { name: "알림" })).toBeTruthy();
  });

  it("unreadNotifications=true 이면 dot + 확장된 aria-label", () => {
    render(<AppHeader unreadNotifications={true} />);
    expect(screen.getByTestId("header-unread-dot")).toBeTruthy();
    expect(screen.getByRole("link", { name: "알림 (새 응원 있음)" })).toBeTruthy();
  });

  it("마이페이지 링크는 /me 로 이동", () => {
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: "마이페이지" }).getAttribute("href")).toBe("/me");
  });
});

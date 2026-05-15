// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { AppHeader } from "./app-header";

describe("AppHeader", () => {
  it("기본 groupLabel/links 렌더", () => {
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: /from\. with/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "알림" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "마이페이지" })).toBeTruthy();
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

  it("groupLabel/groupHref props 반영", () => {
    render(<AppHeader groupLabel="러닝 크루" groupHref="/group/abc" />);
    const groupLink = screen.getByRole("link", { name: /러닝 크루/ });
    expect(groupLink).toBeTruthy();
    expect(groupLink.getAttribute("href")).toBe("/group/abc");
  });
});

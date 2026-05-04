// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/home" }));

import { BottomNav } from "./bottom-nav";

describe("BottomNav", () => {
  it("unreadDot=false 이면 dot 을 렌더하지 않는다", () => {
    render(<BottomNav unreadDot={false} />);
    expect(screen.queryByTestId("home-unread-dot")).toBeNull();
  });

  it("unreadDot=true 이면 홈 탭에 dot 을 렌더", () => {
    render(<BottomNav unreadDot={true} />);
    expect(screen.getByTestId("home-unread-dot")).toBeTruthy();
  });
});

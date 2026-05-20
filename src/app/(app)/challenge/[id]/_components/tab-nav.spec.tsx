import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TabNav } from "./tab-nav";

let mockPathname = "/challenge/abc";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));
vi.mock("next/link", async () => {
  const actual = await vi.importActual<typeof import("next/link")>("next/link");
  return {
    ...actual,
    default: actual.default,
    useLinkStatus: () => ({ pending: false }),
  };
});

describe("TabNav", () => {
  beforeEach(() => {
    mockPathname = "/challenge/abc";
  });

  it("3개 탭 링크 렌더링", () => {
    render(<TabNav challengeId="abc" />);
    expect(screen.getByText("인증 피드")).toBeTruthy();
    expect(screen.getByText("현황판")).toBeTruthy();
    expect(screen.getByText("정보")).toBeTruthy();
  });

  it("pathname /challenge/abc 일 때 인증 피드가 active", () => {
    mockPathname = "/challenge/abc";
    render(<TabNav challengeId="abc" />);
    const feedTab = screen.getByText("인증 피드").closest("a");
    expect(feedTab?.getAttribute("aria-selected")).toBe("true");
  });

  it("pathname /challenge/abc/dashboard 일 때 현황판이 active", () => {
    mockPathname = "/challenge/abc/dashboard";
    render(<TabNav challengeId="abc" />);
    const dashTab = screen.getByText("현황판").closest("a");
    expect(dashTab?.getAttribute("aria-selected")).toBe("true");
    const feedTab = screen.getByText("인증 피드").closest("a");
    expect(feedTab?.getAttribute("aria-selected")).toBe("false");
  });

  it("pathname /challenge/abc/info 일 때 정보가 active", () => {
    mockPathname = "/challenge/abc/info";
    render(<TabNav challengeId="abc" />);
    const infoTab = screen.getByText("정보").closest("a");
    expect(infoTab?.getAttribute("aria-selected")).toBe("true");
  });
});

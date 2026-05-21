import { act, render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TabNav } from "./tab-nav";

let mockPathname = "/challenge/abc";
let mockPending = false;
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));
vi.mock("next/link", async () => {
  const actual = await vi.importActual<typeof import("next/link")>("next/link");
  return {
    ...actual,
    default: actual.default,
    useLinkStatus: () => ({ pending: mockPending }),
  };
});

function getFirstSpinner(): Element | null {
  return screen.getAllByRole("tab")[0].querySelector('svg[aria-hidden="true"]');
}

describe("TabNav", () => {
  beforeEach(() => {
    mockPathname = "/challenge/abc";
    mockPending = false;
  });
  afterEach(() => {
    vi.useRealTimers();
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

  it("pending=false 일 때 spinner 가 opacity-0 (시각적 숨김)", () => {
    mockPending = false;
    render(<TabNav challengeId="abc" />);
    const spinner = getFirstSpinner();
    expect(spinner).not.toBeNull();
    expect(spinner?.getAttribute("class") ?? "").toContain("opacity-0");
  });

  it("pending 이 100ms 미만 지속되면 spinner 가 여전히 opacity-0", () => {
    vi.useFakeTimers();
    mockPending = true;
    render(<TabNav challengeId="abc" />);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    const spinner = getFirstSpinner();
    expect(spinner?.getAttribute("class") ?? "").toContain("opacity-0");
  });

  it("pending 이 100ms 이상 지속되면 spinner 가 opacity-100 으로 fade-in", () => {
    vi.useFakeTimers();
    mockPending = true;
    render(<TabNav challengeId="abc" />);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    const spinner = getFirstSpinner();
    expect(spinner?.getAttribute("class") ?? "").toContain("opacity-100");
  });
});

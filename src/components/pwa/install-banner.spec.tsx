// src/components/pwa/install-banner.spec.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InstallBanner } from "./install-banner";

// vi.useFakeTimers() 는 setTimeout 도 가로채 testing-library 의 findByRole(...) 폴링과
// 충돌 → hang. Date.now() 만 결정적으로 만들기 위해 spyOn 으로 한정한다.
const FIXED_NOW = new Date("2026-05-17T00:00:00Z").getTime();

describe("InstallBanner", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    // module-level cachedDeferred 를 비운다 — appinstalled 핸들러가 cache 를 null 로 만든다.
    // 테스트 시작 시 컴포넌트는 unmount 상태이므로 컴포넌트 내부 핸들러는 영향 없다.
    fireEvent(window, new Event("appinstalled"));
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("기본 렌더 — '홈 화면에 추가' 안내 텍스트 노출", () => {
    render(<InstallBanner />);
    expect(screen.getByText(/홈 화면에 추가/)).toBeInTheDocument();
  });

  it("dismissedUntil 이 미래면 렌더하지 않는다", () => {
    const future = new Date("2026-05-20T00:00:00Z").getTime();
    window.localStorage.setItem("pwa.banner.dismissedUntil", String(future));
    const { container } = render(<InstallBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("dismissedUntil 이 과거면 다시 렌더한다", () => {
    const past = new Date("2026-05-10T00:00:00Z").getTime();
    window.localStorage.setItem("pwa.banner.dismissedUntil", String(past));
    render(<InstallBanner />);
    expect(screen.getByText(/홈 화면에 추가/)).toBeInTheDocument();
  });

  it("닫기 버튼 클릭 시 dismissedUntil 을 +7일로 set 하고 사라진다", () => {
    const { container } = render(<InstallBanner />);
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    const stored = window.localStorage.getItem("pwa.banner.dismissedUntil");
    const expected = new Date("2026-05-24T00:00:00Z").getTime();
    expect(Number(stored)).toBe(expected);
    expect(container.firstChild).toBeNull();
  });

  it("beforeinstallprompt 이벤트가 잡히면 '설치' 버튼이 노출되고 클릭 시 prompt() 호출 + 버튼 사라짐", async () => {
    render(<InstallBanner />);
    const prompt = vi.fn().mockResolvedValue(undefined);
    const fakeEvent = Object.assign(new Event("beforeinstallprompt"), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
    });
    fireEvent(window, fakeEvent);
    const installBtn = await screen.findByRole("button", { name: "설치" });
    fireEvent.click(installBtn);
    expect(prompt).toHaveBeenCalledTimes(1);
    // prompt() 후 deferred 가 null 로 reset → '설치' 버튼이 사라져야 한다.
    await vi.waitFor(() => {
      expect(screen.queryByRole("button", { name: "설치" })).toBeNull();
    });
  });

  it("prompt 결과가 'dismissed' 면 7일 dismiss 가 자동 적용된다", async () => {
    render(<InstallBanner />);
    const prompt = vi.fn().mockResolvedValue(undefined);
    const fakeEvent = Object.assign(new Event("beforeinstallprompt"), {
      prompt,
      userChoice: Promise.resolve({ outcome: "dismissed", platform: "web" }),
    });
    fireEvent(window, fakeEvent);
    const installBtn = await screen.findByRole("button", { name: "설치" });
    fireEvent.click(installBtn);
    await vi.waitFor(() => {
      const stored = window.localStorage.getItem("pwa.banner.dismissedUntil");
      const expected = new Date("2026-05-24T00:00:00Z").getTime();
      expect(Number(stored)).toBe(expected);
    });
  });

  it("appinstalled 이벤트 발생 시 배너가 즉시 사라지고 pwa.everInstalled=1 set", () => {
    const { container } = render(<InstallBanner />);
    fireEvent(window, new Event("appinstalled"));
    expect(container.firstChild).toBeNull();
    expect(window.localStorage.getItem("pwa.everInstalled")).toBe("1");
  });

  it("beforeinstallprompt 가 없으면 iOS 가이드 텍스트만 표시 (설치 버튼 없음)", () => {
    render(<InstallBanner />);
    expect(screen.queryByRole("button", { name: "설치" })).toBeNull();
    expect(screen.getByText(/공유.*홈 화면에 추가/)).toBeInTheDocument();
  });

  it("beforeinstallprompt 잡힌 후 unmount/remount 해도 cached deferred 로 '설치' 버튼이 다시 노출된다", async () => {
    // 라우트 이동 시뮬레이션: 첫 mount 에서 이벤트 캐치 → unmount → 재마운트.
    // beforeinstallprompt 는 다시 발화하지 않으므로 module-level cache 가 동작해야 한다.
    const { unmount } = render(<InstallBanner />);
    const prompt = vi.fn().mockResolvedValue(undefined);
    const fakeEvent = Object.assign(new Event("beforeinstallprompt"), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
    });
    fireEvent(window, fakeEvent);
    await screen.findByRole("button", { name: "설치" });
    unmount();
    render(<InstallBanner />);
    expect(screen.getByRole("button", { name: "설치" })).toBeInTheDocument();
  });
});

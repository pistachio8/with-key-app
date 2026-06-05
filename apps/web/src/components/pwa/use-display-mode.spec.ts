// src/components/pwa/use-display-mode.spec.ts
// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDisplayMode } from "./use-display-mode";

describe("useDisplayMode", () => {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  let mediaState = { matches: false };

  beforeEach(() => {
    listeners.clear();
    mediaState = { matches: false };
    const matchMediaMock = vi.fn().mockImplementation(() => ({
      get matches() {
        return mediaState.matches;
      },
      addEventListener: (_e: string, cb: (e: MediaQueryListEvent) => void) => {
        listeners.add(cb);
      },
      removeEventListener: (_e: string, cb: (e: MediaQueryListEvent) => void) => {
        listeners.delete(cb);
      },
    }));
    Object.defineProperty(window, "matchMedia", { configurable: true, value: matchMediaMock });
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("브라우저 모드면 mode='browser', everInstalled=false (플래그 없음)", () => {
    mediaState.matches = false;
    const { result } = renderHook(() => useDisplayMode());
    expect(result.current.mode).toBe("browser");
    expect(result.current.everInstalled).toBe(false);
  });

  it("standalone 모드면 mode='standalone' 이고 pwa.everInstalled=1 을 set 한다", () => {
    mediaState.matches = true;
    const { result } = renderHook(() => useDisplayMode());
    expect(result.current.mode).toBe("standalone");
    expect(result.current.everInstalled).toBe(true);
    expect(window.localStorage.getItem("pwa.everInstalled")).toBe("1");
  });

  it("이전에 standalone 진입 기록(localStorage)이 있으면 브라우저 모드에서도 everInstalled=true", () => {
    window.localStorage.setItem("pwa.everInstalled", "1");
    mediaState.matches = false;
    const { result } = renderHook(() => useDisplayMode());
    expect(result.current.mode).toBe("browser");
    expect(result.current.everInstalled).toBe(true);
  });

  it("matchMedia change 이벤트로 mode 가 갱신된다", () => {
    mediaState.matches = false;
    const { result } = renderHook(() => useDisplayMode());
    expect(result.current.mode).toBe("browser");
    act(() => {
      mediaState.matches = true;
      listeners.forEach((cb) => cb({ matches: true } as MediaQueryListEvent));
    });
    expect(result.current.mode).toBe("standalone");
    expect(window.localStorage.getItem("pwa.everInstalled")).toBe("1");
  });

  it("iOS Safari fallback: navigator.standalone === true 이면 standalone 으로 본다", () => {
    mediaState.matches = false;
    Object.defineProperty(window.navigator, "standalone", { configurable: true, value: true });
    const { result } = renderHook(() => useDisplayMode());
    expect(result.current.mode).toBe("standalone");
    Object.defineProperty(window.navigator, "standalone", { configurable: true, value: undefined });
  });
});

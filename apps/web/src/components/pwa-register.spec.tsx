// src/components/pwa-register.spec.tsx
// @vitest-environment jsdom
import { render, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PwaRegister } from "./pwa-register";

describe("PwaRegister", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window.navigator, "serviceWorker", {
      configurable: true,
      value: { register: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("standalone 모드에서 마운트되면 pwa.everInstalled=1 을 set 한다", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    render(<PwaRegister />);
    expect(window.localStorage.getItem("pwa.everInstalled")).toBe("1");
  });

  it("브라우저 모드에서 마운트되면 플래그는 set 되지 않는다", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    render(<PwaRegister />);
    expect(window.localStorage.getItem("pwa.everInstalled")).toBeNull();
  });
});

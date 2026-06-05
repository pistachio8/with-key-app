// src/components/pwa/open-in-app-modal.spec.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OpenInAppModal } from "./open-in-app-modal";

describe("OpenInAppModal", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  it("기본적으로 모달이 열려 있고 두 액션 버튼이 보인다", () => {
    render(<OpenInAppModal />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "앱으로 열기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "웹으로 계속" })).toBeInTheDocument();
  });

  it("세션 dismiss 플래그가 있으면 렌더하지 않는다", () => {
    window.sessionStorage.setItem("pwa.modal.thisSession", "dismissed");
    const { container } = render(<OpenInAppModal />);
    expect(container.firstChild).toBeNull();
  });

  it("'웹으로 계속' 클릭 시 세션 플래그 set 후 모달 닫힘", () => {
    render(<OpenInAppModal />);
    fireEvent.click(screen.getByRole("button", { name: "웹으로 계속" }));
    expect(window.sessionStorage.getItem("pwa.modal.thisSession")).toBe("dismissed");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("'앱으로 열기' 클릭 시 세션 dismiss 를 set 한 뒤 window.location.assign('/home') 호출", () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign, href: "http://localhost/home" } as unknown as Location,
    });
    render(<OpenInAppModal />);
    fireEvent.click(screen.getByRole("button", { name: "앱으로 열기" }));
    // 같은 탭에서 새로고침되어도 모달이 다시 뜨는 무한 루프를 막기 위해 세션 dismiss 도 함께 set.
    expect(window.sessionStorage.getItem("pwa.modal.thisSession")).toBe("dismissed");
    expect(assign).toHaveBeenCalledWith("/home");
  });

  it("'앱으로 열기' → 새로고침 시뮬레이션(재마운트)에서는 다시 렌더되지 않는다", () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign, href: "http://localhost/home" } as unknown as Location,
    });
    const first = render(<OpenInAppModal />);
    fireEvent.click(screen.getByRole("button", { name: "앱으로 열기" }));
    first.unmount();
    const second = render(<OpenInAppModal />);
    expect(second.container.firstChild).toBeNull();
  });
});

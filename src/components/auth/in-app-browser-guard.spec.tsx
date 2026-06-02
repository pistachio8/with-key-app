// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InAppBrowserGuard } from "./in-app-browser-guard";

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: toastMock }));

const UA_KAKAOTALK_ANDROID =
  "Mozilla/5.0 (Linux; Android 12; SM-G991N) Chrome/96 Mobile;KAKAOTALK 10.0.0";
const UA_KAKAOTALK_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) Mobile/15E148 KAKAOTALK 10.4.0";
const UA_SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) Version/16.0 Mobile/15E148 Safari/604.1";

function stubUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: ua,
  });
}

function stubClipboard(writeText = vi.fn().mockResolvedValue(undefined)) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText } as unknown as Clipboard,
  });
  return writeText;
}

describe("InAppBrowserGuard", () => {
  beforeEach(() => {
    toastMock.success.mockClear();
    toastMock.error.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("kind=null + 일반 Safari UA 면 children 그대로 렌더 (가드 미노출)", async () => {
    stubUserAgent(UA_SAFARI_IOS);
    render(
      <InAppBrowserGuard kind={null} targetUrl="https://from.with/login">
        <button>로그인</button>
      </InAppBrowserGuard>,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "로그인" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("SSR kind=kakaotalk 이면 첫 paint 부터 가드 UI 노출 (children 미렌더)", () => {
    stubUserAgent(UA_KAKAOTALK_IOS);
    render(
      <InAppBrowserGuard kind="kakaotalk" targetUrl="https://from.with/login">
        <button>로그인</button>
      </InAppBrowserGuard>,
    );
    expect(screen.getByRole("region")).toBeInTheDocument();
    expect(screen.getByText(/인앱브라우저에서는/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "로그인" })).toBeNull();
  });

  it("카카오톡 kind 면 카카오톡 메뉴 안내 카피 노출", async () => {
    stubUserAgent(UA_KAKAOTALK_IOS);
    render(
      <InAppBrowserGuard kind="kakaotalk" targetUrl="https://from.with/login">
        <button>로그인</button>
      </InAppBrowserGuard>,
    );
    await waitFor(() => {
      expect(screen.getAllByText(/카카오톡 우상단/)[0]).toBeInTheDocument();
    });
  });

  it("Android 인앱뷰에서는 '외부 브라우저로 열기' 버튼이 클릭 시 intent URL 로 navigate", async () => {
    stubUserAgent(UA_KAKAOTALK_ANDROID);
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { href: "https://from.with/login" } as unknown as Location,
      writable: true,
    });
    render(
      <InAppBrowserGuard kind="kakaotalk" targetUrl="https://from.with/login">
        <button>로그인</button>
      </InAppBrowserGuard>,
    );

    const openBtn = await screen.findByRole("button", { name: /외부 브라우저로 열기/ });
    fireEvent.click(openBtn);

    expect(window.location.href).toMatch(/^intent:\/\/from\.with\/login#Intent;/);
    expect(window.location.href).toContain("package=com.android.chrome");
    expect(window.location.href).toContain("S.browser_fallback_url=");
  });

  it("iOS 인앱뷰에서는 '링크 복사' 버튼이 클립보드 write + success toast", async () => {
    stubUserAgent(UA_KAKAOTALK_IOS);
    const writeText = stubClipboard();

    render(
      <InAppBrowserGuard kind="kakaotalk" targetUrl="https://from.with/invite/abc">
        <button>로그인</button>
      </InAppBrowserGuard>,
    );

    const copyBtn = await screen.findByRole("button", {
      name: /링크 복사 후 Safari/,
    });
    fireEvent.click(copyBtn);

    expect(writeText).toHaveBeenCalledWith("https://from.with/invite/abc");
    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalled();
    });
  });

  it("클립보드 write 실패 시 error toast", async () => {
    stubUserAgent(UA_KAKAOTALK_IOS);
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    stubClipboard(writeText);
    // 콘솔 에러 silence — error path 검증 시 의도된 로그.
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <InAppBrowserGuard kind="kakaotalk" targetUrl="https://from.with/invite/abc">
        <button>로그인</button>
      </InAppBrowserGuard>,
    );

    const copyBtn = await screen.findByRole("button", {
      name: /링크 복사 후 Safari/,
    });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalled();
    });
    consoleSpy.mockRestore();
  });

  it("앱별 메뉴 안내 fallback 카드가 항상 노출 (intent/복사 실패 시 보장)", () => {
    // hydration 후 navigator UA (Safari) 가 detectInAppBrowser=null 이라 ssrKind=naver 유지.
    stubUserAgent(UA_SAFARI_IOS);
    render(
      <InAppBrowserGuard kind="naver" targetUrl="https://from.with/login">
        <button>로그인</button>
      </InAppBrowserGuard>,
    );
    expect(screen.getByText("전환이 안 되면 직접:")).toBeInTheDocument();
    expect(screen.getAllByText(/네이버 우상단 메뉴/).length).toBeGreaterThan(0);
  });
});

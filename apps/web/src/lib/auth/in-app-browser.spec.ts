import { describe, it, expect } from "vitest";
import { detectInAppBrowser, isAndroid, isIOS, buildAndroidIntentUrl } from "./in-app-browser";

// UA fixture — 실제 기기에서 수집한 표본을 단순화. 패턴 변경시 본 fixture 도 함께 갱신.
const UA = {
  kakaotalkAndroid:
    "Mozilla/5.0 (Linux; Android 12; SM-G991N) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/96.0.4664.45 Mobile Safari/537.36;KAKAOTALK 10.0.0",
  kakaotalkIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.0",
  instagramIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 290.0.0.13.115",
  facebookIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0.0.30.108]",
  facebookAndroid:
    "Mozilla/5.0 (Linux; Android 12; SM-G991N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/440.0.0.30.108]",
  naverAndroid:
    "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96 Mobile NAVER(inapp; search; 1090; 12.4.5)",
  lineIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/13.16.0",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 12; SM-G991N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/96.0.4664.45 Mobile Safari/537.36",
  safariIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 12; SM-G991N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Mobile Safari/537.36",
  chromeDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

describe("detectInAppBrowser", () => {
  it("카카오톡 (Android · iOS) 모두 'kakaotalk' 반환", () => {
    expect(detectInAppBrowser(UA.kakaotalkAndroid)).toBe("kakaotalk");
    expect(detectInAppBrowser(UA.kakaotalkIOS)).toBe("kakaotalk");
  });

  it("Instagram → 'instagram'", () => {
    expect(detectInAppBrowser(UA.instagramIOS)).toBe("instagram");
  });

  it("Facebook (FBAN/FBAV/FB_IAB 형식) → 'facebook'", () => {
    expect(detectInAppBrowser(UA.facebookIOS)).toBe("facebook");
    expect(detectInAppBrowser(UA.facebookAndroid)).toBe("facebook");
  });

  it("네이버앱 NAVER(inapp; ...) → 'naver'", () => {
    expect(detectInAppBrowser(UA.naverAndroid)).toBe("naver");
  });

  it("Line → 'line'", () => {
    expect(detectInAppBrowser(UA.lineIOS)).toBe("line");
  });

  it("정체불명 Android webview (; wv)) → 'other'", () => {
    expect(detectInAppBrowser(UA.androidWebView)).toBe("other");
  });

  it("일반 Safari/Chrome 은 null", () => {
    expect(detectInAppBrowser(UA.safariIOS)).toBeNull();
    expect(detectInAppBrowser(UA.chromeAndroid)).toBeNull();
    expect(detectInAppBrowser(UA.chromeDesktop)).toBeNull();
  });

  it("null · undefined · 빈 문자열은 null", () => {
    expect(detectInAppBrowser(null)).toBeNull();
    expect(detectInAppBrowser(undefined)).toBeNull();
    expect(detectInAppBrowser("")).toBeNull();
  });
});

describe("isAndroid / isIOS", () => {
  it("Android UA 만 isAndroid true", () => {
    expect(isAndroid(UA.chromeAndroid)).toBe(true);
    expect(isAndroid(UA.kakaotalkAndroid)).toBe(true);
    expect(isAndroid(UA.safariIOS)).toBe(false);
    expect(isAndroid(UA.chromeDesktop)).toBe(false);
    expect(isAndroid(null)).toBe(false);
  });

  it("iPhone/iPad/iPod 만 isIOS true", () => {
    expect(isIOS(UA.safariIOS)).toBe(true);
    expect(isIOS(UA.kakaotalkIOS)).toBe(true);
    expect(isIOS(UA.chromeAndroid)).toBe(false);
    expect(isIOS(UA.chromeDesktop)).toBe(false);
    expect(isIOS(null)).toBe(false);
  });
});

describe("buildAndroidIntentUrl", () => {
  it("Chrome 패키지 + browser_fallback_url 인코딩 + scheme 보존", () => {
    const target = "https://from.with/invite/abc?ref=kakao";
    const url = buildAndroidIntentUrl(target);

    expect(url.startsWith("intent://from.with/invite/abc?ref=kakao#Intent;")).toBe(true);
    expect(url).toContain("scheme=https;");
    expect(url).toContain("package=com.android.chrome;");
    expect(url).toContain(`S.browser_fallback_url=${encodeURIComponent(target)};`);
    expect(url.endsWith(";end")).toBe(true);
  });

  it("hash · query 보존", () => {
    const target = "https://from.with/login?next=%2Finvite%2Fxyz#section";
    const url = buildAndroidIntentUrl(target);
    expect(url).toContain("/login?next=%2Finvite%2Fxyz#section");
  });
});

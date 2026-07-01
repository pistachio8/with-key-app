// EVAL-0053 — toNotificationHref 순수 변환 단위 테스트 (targetUrl/url → Expo Router href).
// ./notification-handler 는 ./notifications(expo-notifications/device/constants)와 expo-router 를
// 전이 import 하므로, 순수 함수만 검사하더라도 native 모듈을 경계에서 모킹해 import 를 통과시킨다.
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  useLastNotificationResponse: jest.fn(() => null),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 5 },
}));
jest.mock("expo-device", () => ({
  get isDevice() {
    return true;
  },
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "0.1.0", extra: { eas: { projectId: "p" } } } },
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

// eslint-disable-next-line import/first -- jest.mock 은 babel 이 hoist 하므로 모킹 선언을 위에 둔다
import { toNotificationHref } from "./notification-handler";

describe("toNotificationHref", () => {
  it("내부 절대 경로 targetUrl 을 그대로 href 로 반환한다", () => {
    expect(toNotificationHref({ targetUrl: "/challenge/abc" })).toBe("/challenge/abc");
    expect(toNotificationHref({ targetUrl: "/challenge/abc/action" })).toBe(
      "/challenge/abc/action",
    );
  });

  it("targetUrl 이 없으면 url 로 폴백한다", () => {
    expect(toNotificationHref({ url: "/home" })).toBe("/home");
  });

  it("targetUrl 이 url 보다 우선한다", () => {
    expect(toNotificationHref({ targetUrl: "/challenge/x", url: "/home" })).toBe("/challenge/x");
  });

  it("빈 문자열 targetUrl 은 url 로 폴백한다", () => {
    expect(toNotificationHref({ targetUrl: "", url: "/home" })).toBe("/home");
  });

  it("외부 http(s) URL 은 차단한다(null)", () => {
    expect(toNotificationHref({ targetUrl: "https://evil.example/login" })).toBeNull();
    expect(toNotificationHref({ url: "http://evil.example" })).toBeNull();
  });

  it("protocol-relative(`//`) URL 은 차단한다(null)", () => {
    expect(toNotificationHref({ targetUrl: "//evil.example/path" })).toBeNull();
  });

  it("절대 경로가 아닌(`/` 미시작) 값은 차단한다(null)", () => {
    expect(toNotificationHref({ targetUrl: "challenge/abc" })).toBeNull();
  });

  it("data 가 객체가 아니거나 비어 있으면 null", () => {
    expect(toNotificationHref(null)).toBeNull();
    expect(toNotificationHref(undefined)).toBeNull();
    expect(toNotificationHref("/challenge/abc")).toBeNull();
    expect(toNotificationHref({})).toBeNull();
  });

  it("targetUrl/url 이 문자열이 아니면 null", () => {
    expect(toNotificationHref({ targetUrl: 123 })).toBeNull();
    expect(toNotificationHref({ targetUrl: { pathname: "/x" } })).toBeNull();
  });
});

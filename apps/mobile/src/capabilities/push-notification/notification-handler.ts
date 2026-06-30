// 푸시 알림 수신 핸들러 (EVAL-0053 · A6) — foreground 배너 표시 + 탭 시 targetUrl 딥링크 이동.
// expo-notifications native SDK 는 notifications.ts(capability SDK 경계, 04 §5.1)만 import 한다.
// 이 파일은 (1) 순수 변환 함수(toNotificationHref — 단위 테스트 대상)와 (2) 그 변환을 native 훅에
// 묶어 화면 이동시키는 React hook 만 둔다. native import 없음.
import { useEffect } from "react";
import { type Href, useRouter } from "expo-router";

import {
  configureForegroundNotificationDisplay,
  ensureAndroidChannel,
  useLastNotificationResponse,
} from "./notifications";

// send.ts(PushPayload)가 Expo data 로 싣는 알림 메타 중 라우팅에 쓰는 필드.
// 외부(서버 발송) 입력이라 unknown 으로 받고 좁힌다.
type NotificationRouteData = {
  targetUrl?: unknown;
  url?: unknown;
};

/**
 * 알림 data 의 `targetUrl`(우선) 또는 `url`(폴백)을 Expo Router href 로 변환한다.
 * 내부 절대 경로(`/...`)만 허용한다 — 외부 URL·scheme·protocol-relative(`//`)는 차단(오픈 리다이렉트 방지).
 * 변환 불가(빈 값·외부·잘못된 형태)면 null 을 반환해 이동하지 않는다.
 */
export function toNotificationHref(data: unknown): Href | null {
  if (typeof data !== "object" || data === null) return null;

  const { targetUrl, url } = data as NotificationRouteData;
  const raw =
    typeof targetUrl === "string" && targetUrl.length > 0
      ? targetUrl
      : typeof url === "string" && url.length > 0
        ? url
        : null;
  if (raw === null) return null;

  // 내부 경로만: 단일 슬래시로 시작하고 `//`(protocol-relative · 외부)가 아니어야 한다.
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;

  return raw as Href;
}

/**
 * 알림 수신·탭 라우팅을 (app) 셸에 1회 마운트한다(_layout.tsx).
 * - foreground 표시 정책을 설정하고(인앱 배너),
 * - 탭 응답(foreground/background/killed)을 구독해 `targetUrl` 화면으로 router.push 한다.
 * useLastNotificationResponse 가 identifier 로 중복을 제거하므로 같은 응답이 재이동되지 않는다.
 */
export function useNotificationRouting(): void {
  const router = useRouter();
  const lastResponse = useLastNotificationResponse();

  // foreground 표시 정책 + Android 알림 채널을 mount 시 1회 설정(전역·idempotent).
  // 채널을 여기서 보장해 수신 표시가 토큰 등록(EVAL-0052) 타이밍에 의존하지 않게 한다.
  useEffect(() => {
    configureForegroundNotificationDisplay();
    void ensureAndroidChannel();
  }, []);

  // 탭 응답 → 딥링크 이동. undefined(판정 전)·null(응답 없음)은 건너뛴다.
  useEffect(() => {
    if (!lastResponse) return;
    const href = toNotificationHref(lastResponse.notification.request.content.data);
    if (href) router.push(href);
  }, [lastResponse, router]);
}

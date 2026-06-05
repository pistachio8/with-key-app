// ADR-0008 — 카카오톡·인스타·페북·네이버·라인 등 SNS 인앱브라우저는
// 카카오 OAuth redirect/세션 쿠키 보존이 깨지는 사례가 잦아, 진입 시점에
// 감지해 사용자를 외부(시스템) 브라우저로 안내한다.
//
// 가드 UI 가 앱별 메뉴 위치 안내를 분기할 수 있도록 boolean 대신 kind 반환.
// detection 미스 시 일반 브라우저로 인지 → 가드 없이 카카오 OAuth 시도 →
// 실패. V1 에서 callback 실패 graceful fallback 추가 검토 (ADR-0008 Consequences).

export type InAppBrowserKind = "kakaotalk" | "instagram" | "facebook" | "naver" | "line" | "other";

export function detectInAppBrowser(ua: string | null | undefined): InAppBrowserKind | null {
  if (!ua) return null;
  if (/KAKAOTALK/i.test(ua)) return "kakaotalk";
  if (/Instagram/i.test(ua)) return "instagram";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "facebook";
  if (/NAVER\(inapp|; NAVER /i.test(ua)) return "naver";
  if (/Line\//i.test(ua)) return "line";
  // 일반 Android wv 표식 — 정체불명 webview. 표준 Chrome/Safari 는 ; wv) 없음.
  if (/;\s*wv\)/i.test(ua)) return "other";
  return null;
}

export function isAndroid(ua: string | null | undefined): boolean {
  return !!ua && /Android/i.test(ua);
}

export function isIOS(ua: string | null | undefined): boolean {
  return !!ua && /iPhone|iPad|iPod/i.test(ua);
}

// Android intent URL — Chrome 우선 deep link, fallback 으로 browser_fallback_url 보장.
// 카카오톡 최신 버전이 intent scheme 차단한 사례 보고 — 가드 UI 가 메뉴 안내도
// 같이 노출해 정체 시 사용자가 수동 전환 가능 (ADR-0008 Decision).
export function buildAndroidIntentUrl(target: string): string {
  const u = new URL(target);
  const pathQuery = u.pathname + u.search + u.hash;
  return `intent://${u.host}${pathQuery}#Intent;scheme=${u.protocol.replace(":", "")};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(target)};end`;
}

import { headers } from "next/headers";
import { Suspense } from "react";
import { detectInAppBrowser } from "@/lib/auth/in-app-browser";
import { LoginScreen } from "./_components/login-screen";

// ADR-0008 — SSR 단계에서 user-agent 기반 인앱뷰 kind 결정 후 client component 에 props 전달.
// 카카오톡/인스타/페북/네이버/라인 인앱브라우저 진입 시 첫 paint 부터 가드 노출 (깜빡임 방지).
export default async function LoginPage() {
  const h = await headers();
  const inAppKind = detectInAppBrowser(h.get("user-agent"));
  return (
    // useSearchParams 는 Suspense 경계 안에서 호출돼야 한다 (Next.js 16).
    <Suspense fallback={null}>
      <LoginScreen inAppKind={inAppKind} />
    </Suspense>
  );
}

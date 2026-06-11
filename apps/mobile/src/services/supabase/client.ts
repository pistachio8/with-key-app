// Supabase RN client 싱글톤 (ADR-0034). cookie flow(@supabase/ssr) 는 RN 경로에서
// 쓰지 않는다 — 세션은 SecureStore chunked adapter, refresh 는 AppState 연동.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

import { createAuthSessionStorage } from "./auth-session-storage";

let client: SupabaseClient | null = null;

// ADR-0007 fail-fast 원칙: env 누락은 런타임 첫 사용 시점에 명확한 메시지로 즉시 실패.
// EXPO_PUBLIC_* 만 허용 — sb_secret_* 등 서버 전용 키는 앱 번들 포함 금지 (03 §6).
export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url) throw new Error("EXPO_PUBLIC_SUPABASE_URL is required for mobile supabase client");
  if (!key) {
    throw new Error("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required for mobile supabase client");
  }

  client = createClient(url, key, {
    auth: {
      storage: createAuthSessionStorage(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // RN 은 URL 세션 감지 없음 — deep link 는 라우트에서 명시 처리
    },
  });
  return client;
}

// supabase-js RN 권장 패턴: foreground 에서만 토큰 auto-refresh 를 돌린다.
// 루트 레이아웃 mount 시 1회 등록하고 cleanup 함수를 반환한다.
export function registerAppStateAutoRefresh(): () => void {
  const supabase = getSupabaseClient();
  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
  supabase.auth.startAutoRefresh();

  return () => {
    supabase.auth.stopAutoRefresh();
    subscription.remove();
  };
}

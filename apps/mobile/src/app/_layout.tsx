import Constants from "expo-constants";
import { Stack } from "expo-router";
import { useEffect } from "react";

import { kakaoAuth } from "@/capabilities/kakao-auth";
import { SessionProvider } from "@/features/auth";
import { registerAppStateAutoRefresh } from "@/services/supabase/client";

export default function RootLayout() {
  useEffect(() => {
    // Kakao SDK 초기화 — native app key 는 공개 가능 키 (콘솔에서 패키지 식별자로 제한).
    const nativeAppKey = process.env.EXPO_PUBLIC_KAKAO_NATIVE_KEY;
    if (nativeAppKey) {
      kakaoAuth.init(nativeAppKey);
    } else if (Constants.expoConfig?.extra?.appVariant !== "prod") {
      console.warn("[auth] EXPO_PUBLIC_KAKAO_NATIVE_KEY missing — Kakao login disabled");
    }

    return registerAppStateAutoRefresh();
  }, []);

  return (
    <SessionProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SessionProvider>
  );
}

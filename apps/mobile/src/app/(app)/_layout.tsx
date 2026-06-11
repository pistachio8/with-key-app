// (app) group auth gate — 미인증이면 보호 route 전체를 /login 으로 차단 (00 §8 G5 · 04 §3).
// SecureStore 세션 복원이 끝나기 전에는 게이트 판정을 보류한다 (flash 금지, EVAL-0012).
import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useSession } from "@/features/auth";

export default function AppLayout() {
  const { session, isLoading } = useSession();

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      {/* (flow) = 풀스크린 생성 플로우 — 04 §3 presentation: 'modal' */}
      <Stack.Screen name="(flow)" options={{ presentation: "modal" }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    backgroundColor: "#F7FAFC",
    flex: 1,
    justifyContent: "center",
  },
});

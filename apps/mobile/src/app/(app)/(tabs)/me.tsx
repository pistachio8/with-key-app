// /me — 프로필/설정 + 로그아웃 (EVAL-0017: 홈이 실데이터 화면으로 교체되며
// EVAL-0012 의 로그아웃 진입점을 여기로 이전 — 수동 검증 플로우(login→logout) 보존).
// EVAL-0055: 알림 설정 섹션(notification_prefs 3종 토글) 삽입. 프로필 이름 편집은 후속 task.
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { signOut, useSession } from "@/features/auth";
import { NotificationSettingsSection } from "@/features/profile/NotificationSettingsSection";
import { colors } from "@/shared/theme/colors";

export default function MeScreen() {
  const { session } = useSession();
  const userId = session?.user.id;
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut(); // 실패해도 onAuthStateChange 가 화면 상태를 결정한다
    setIsSigningOut(false);
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={["top"]} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>내 정보</Text>
          <Text style={styles.meta}>email: {session?.user.email ?? "(없음)"}</Text>
          {userId && <NotificationSettingsSection userId={userId} />}
          <Pressable
            accessibilityRole="button"
            disabled={isSigningOut}
            onPress={() => void handleSignOut()}
            style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}
          >
            <Text style={styles.signOutLabel}>{isSigningOut ? "로그아웃 중…" : "로그아웃"}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 32,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  title: {
    color: colors.textStrong,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 16,
  },
  meta: {
    color: colors.textSubtle,
    fontSize: 15,
    marginTop: 6,
  },
  signOutButton: {
    alignItems: "center",
    backgroundColor: colors.textStrong,
    borderRadius: 12,
    marginTop: 28,
    paddingVertical: 14,
  },
  pressed: {
    opacity: 0.85,
  },
  signOutLabel: {
    color: colors.inverse,
    fontSize: 16,
    fontWeight: "700",
  },
});

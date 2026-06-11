import "@withkey/domain";

import Constants from "expo-constants";
import { Redirect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { signOut, useSession } from "@/features/auth";

type MobileExpoExtra = {
  appVariant?: string;
  universalLinkDomain?: string;
};

export default function HomeScreen() {
  const { session, isLoading } = useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const extra = Constants.expoConfig?.extra as MobileExpoExtra | undefined;
  const appVariant = extra?.appVariant ?? "dev";
  const universalLinkDomain = extra?.universalLinkDomain ?? "dev.fromwith.app";

  // SecureStore 세션 복원이 끝나기 전에는 어떤 화면도 확정하지 않는다 (flash 금지).
  if (isLoading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut(); // 실패해도 onAuthStateChange 가 화면 상태를 결정한다
    setIsSigningOut(false);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.container}>
        <Text style={styles.kicker}>fromwith</Text>
        <Text style={styles.title}>로그인됨</Text>
        <Text style={styles.meta}>email: {session.user.email ?? "(없음)"}</Text>
        <Text style={styles.meta}>variant: {appVariant}</Text>
        <Text style={styles.meta}>links: {universalLinkDomain}</Text>
        <Pressable
          accessibilityRole="button"
          disabled={isSigningOut}
          onPress={handleSignOut}
          style={({ pressed }) => [styles.signOutButton, pressed && styles.buttonPressed]}
        >
          <Text style={styles.signOutLabel}>{isSigningOut ? "로그아웃 중…" : "로그아웃"}</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7FAFC",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  kicker: {
    color: "#0F766E",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  title: {
    color: "#111827",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0,
    marginBottom: 18,
  },
  meta: {
    color: "#4B5563",
    fontSize: 15,
    letterSpacing: 0,
    marginTop: 6,
  },
  signOutButton: {
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 12,
    marginTop: 28,
    paddingVertical: 14,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  signOutLabel: {
    color: "#F9FAFB",
    fontSize: 16,
    fontWeight: "700",
  },
});

// magic link universal link 착지점 — https://<도메인>/auth/callback?token_hash=...
// 이 라우트가 App Links 로 열리면 token_hash 를 세션으로 교환한다 (ADR-0007 token_hash flow).
// invite next/stash orchestration 은 EVAL-0013 범위.
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { verifyMagicLinkToken } from "@/features/auth";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { token_hash: tokenHash } = useLocalSearchParams<{ token_hash?: string }>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!tokenHash) return;
    let active = true;

    verifyMagicLinkToken(tokenHash).then((result) => {
      if (!active) return;
      if (result.ok) {
        router.replace("/");
      } else {
        setFailed(true);
      }
    });

    return () => {
      active = false;
    };
  }, [tokenHash, router]);

  if (!tokenHash || failed) {
    return <Redirect href="/login" />;
  }

  return (
    <View style={styles.screen}>
      <ActivityIndicator />
      <Text style={styles.label}>로그인 처리 중…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    backgroundColor: "#F7FAFC",
    flex: 1,
    justifyContent: "center",
  },
  label: {
    color: "#4B5563",
    fontSize: 15,
    marginTop: 12,
  },
});

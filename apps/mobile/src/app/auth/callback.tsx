// magic link universal link 착지점 — https://<도메인>/auth/callback?token_hash=...
// 이 라우트가 App Links 로 열리면 token_hash 를 세션으로 교환한다 (ADR-0007 token_hash flow).
// 세션 성립 후 착지는 PostAuthRedirect — stash 된 invite 가 있으면 수락 복귀 (EVAL-0013).
import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { verifyMagicLinkToken } from "@/features/auth";
import { PostAuthRedirect } from "@/features/invite";

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ token_hash?: string | string[] }>();
  // 중복 쿼리 파라미터는 string[] 로 도착할 수 있다 — 첫 값만 사용
  const tokenHash = Array.isArray(params.token_hash) ? params.token_hash[0] : params.token_hash;
  const [status, setStatus] = useState<"pending" | "verified" | "failed">("pending");

  useEffect(() => {
    if (!tokenHash) return;
    let active = true;

    verifyMagicLinkToken(tokenHash).then((result) => {
      if (!active) return;
      setStatus(result.ok ? "verified" : "failed");
    });

    return () => {
      active = false;
    };
  }, [tokenHash]);

  if (!tokenHash || status === "failed") {
    return <Redirect href="/login" />;
  }

  if (status === "verified") {
    return <PostAuthRedirect />;
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

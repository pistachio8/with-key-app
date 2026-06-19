import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { requestMagicLink, signInWithKakao, useSession, type AuthErrorCode } from "@/features/auth";
import { DevLoginSheet } from "@/features/auth/dev/dev-login-sheet";
import { PostAuthRedirect } from "@/features/invite";

const ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  kakao_cancelled: "카카오 로그인이 취소되었어요. 다시 시도해 주세요.",
  kakao_no_id_token: "카카오 로그인 설정이 아직 준비되지 않았어요. 이메일 링크로 로그인해 주세요.",
  invalid_email: "이메일 형식이 올바르지 않아요.",
  rate_limited: "잠시 후 다시 시도해 주세요. (전송 제한)",
  auth_failed: "로그인에 실패했어요. 잠시 후 다시 시도해 주세요.",
};

export default function LoginScreen() {
  const { session, isLoading } = useSession();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState<"kakao" | "magic-link" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // dev-login 숨긴 메뉴 (spec §5.4) — kicker long-press 로 연다. __DEV__ 에서만 렌더.
  const [devSheetOpen, setDevSheetOpen] = useState(false);

  if (isLoading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator />
      </View>
    );
  }

  // 세션 성립(Kakao SSO·magic link 어느 쪽이든) 시 즉시 이탈 — 인증→login 우회 (G5).
  // stash 된 invite token 이 있으면 /invite/<token> 으로 복귀, 없으면 /home (EVAL-0013).
  if (session) {
    return <PostAuthRedirect />;
  }

  const handleKakao = async () => {
    setPending("kakao");
    setMessage(null);
    const result = await signInWithKakao();
    if (!result.ok) setMessage(ERROR_MESSAGES[result.error]);
    setPending(null);
  };

  const handleMagicLink = async () => {
    setPending("magic-link");
    setMessage(null);
    const result = await requestMagicLink(email.trim());
    setMessage(
      result.ok
        ? "로그인 링크를 메일로 보냈어요. 메일함을 확인해 주세요."
        : ERROR_MESSAGES[result.error],
    );
    setPending(null);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.container}
        >
          <Text style={styles.kicker} onLongPress={() => setDevSheetOpen(true)}>
            fromwith
          </Text>
          <Text style={styles.title}>로그인</Text>

          <Pressable
            accessibilityRole="button"
            disabled={pending !== null}
            onPress={handleKakao}
            style={({ pressed }) => [styles.kakaoButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.kakaoLabel}>
              {pending === "kakao" ? "카카오로 로그인 중…" : "카카오로 시작하기"}
            </Text>
          </Pressable>

          <Text style={styles.divider}>또는 이메일 링크로</Text>

          <TextInput
            accessibilityLabel="이메일"
            autoCapitalize="none"
            autoComplete="email"
            editable={pending === null}
            inputMode="email"
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            value={email}
          />
          <Pressable
            accessibilityRole="button"
            disabled={pending !== null || email.trim().length === 0}
            onPress={handleMagicLink}
            style={({ pressed }) => [
              styles.magicLinkButton,
              (pressed || email.trim().length === 0) && styles.buttonPressed,
            ]}
          >
            <Text style={styles.magicLinkLabel}>
              {pending === "magic-link" ? "전송 중…" : "로그인 링크 받기"}
            </Text>
          </Pressable>

          {message ? <Text style={styles.message}>{message}</Text> : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
      {__DEV__ && <DevLoginSheet visible={devSheetOpen} onClose={() => setDevSheetOpen(false)} />}
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
  safeArea: {
    flex: 1,
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
    marginBottom: 10,
    textTransform: "uppercase",
  },
  title: {
    color: "#111827",
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 28,
  },
  kakaoButton: {
    alignItems: "center",
    backgroundColor: "#FEE500",
    borderRadius: 12,
    paddingVertical: 14,
  },
  kakaoLabel: {
    color: "#191919",
    fontSize: 16,
    fontWeight: "700",
  },
  divider: {
    color: "#6B7280",
    fontSize: 13,
    marginBottom: 12,
    marginTop: 24,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D1D5DB",
    borderRadius: 12,
    borderWidth: 1,
    color: "#111827",
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  magicLinkButton: {
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 12,
    marginTop: 12,
    paddingVertical: 14,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  magicLinkLabel: {
    color: "#F9FAFB",
    fontSize: 16,
    fontWeight: "700",
  },
  message: {
    color: "#374151",
    fontSize: 14,
    marginTop: 16,
  },
});

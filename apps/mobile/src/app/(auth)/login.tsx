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
import { colors } from "@/shared/theme/colors";
import { radius } from "@/shared/theme/radius";
import { spacing } from "@/shared/theme/spacing";
import { typography } from "@/shared/theme/typography";

const ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  kakao_cancelled: "카카오 로그인이 취소되었어요. 다시 시도해 주세요.",
  kakao_no_id_token: "카카오 로그인 설정이 아직 준비되지 않았어요. 이메일 링크로 로그인해 주세요.",
  invalid_email: "이메일 형식이 올바르지 않아요.",
  rate_limited: "잠시 후 다시 시도해 주세요. (전송 제한)",
  auth_failed: "로그인에 실패했어요. 잠시 후 다시 시도해 주세요.",
};

// 상태 카드 톤 — PWA 는 매직링크 성공 시 primary-tinted status 카드, 오류 시 destructive toast.
// RN 은 인라인 카드 하나로 통합하되 톤(성공=primary / 오류=destructive)으로 위계를 구분한다(spec §B-3 #4).
type Feedback = { tone: "success" | "error"; text: string };

export default function LoginScreen() {
  const { session, isLoading } = useSession();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState<"kakao" | "magic-link" | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  // dev-login 숨긴 메뉴 (spec §5.4) — 워드마크 long-press 로 연다. __DEV__ 에서만 렌더.
  const [devSheetOpen, setDevSheetOpen] = useState(false);

  if (isLoading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} />
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
    setFeedback(null);
    const result = await signInWithKakao();
    if (!result.ok) setFeedback({ tone: "error", text: ERROR_MESSAGES[result.error] });
    setPending(null);
  };

  const handleMagicLink = async () => {
    setPending("magic-link");
    setFeedback(null);
    const result = await requestMagicLink(email.trim());
    setFeedback(
      result.ok
        ? { tone: "success", text: "로그인 링크를 메일로 보냈어요. 메일함을 확인해 주세요." }
        : { tone: "error", text: ERROR_MESSAGES[result.error] },
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
          <View style={styles.brand}>
            <Text
              accessibilityRole="header"
              style={styles.wordmark}
              onLongPress={() => setDevSheetOpen(true)}
            >
              from.with
            </Text>
            <Text style={styles.tagline}>친구들과 함께 운동 내기 시작하기</Text>
          </View>

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
            placeholderTextColor={colors.mutedForeground}
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

          {feedback ? (
            <View
              accessibilityLiveRegion="polite"
              style={[
                styles.feedbackCard,
                feedback.tone === "error" ? styles.feedbackError : styles.feedbackSuccess,
              ]}
            >
              <Text
                style={[styles.feedbackText, feedback.tone === "error" && styles.feedbackTextError]}
              >
                {feedback.text}
              </Text>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
      {__DEV__ && <DevLoginSheet visible={devSheetOpen} onClose={() => setDevSheetOpen(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
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
    paddingHorizontal: spacing.xl,
  },
  brand: {
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  wordmark: {
    ...typography.h1,
    color: colors.brandPrimaryDeep,
  },
  tagline: {
    ...typography.body,
    color: colors.mutedForeground,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  // 카카오 CTA = PWA 기본 버튼(bg-primary) parity — 앱 primary 로 채운 1차 액션.
  kakaoButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  kakaoLabel: {
    color: colors.primaryForeground,
    fontSize: 16,
    fontWeight: "700",
  },
  divider: {
    ...typography.sub,
    marginBottom: spacing.md,
    marginTop: spacing.xl,
  },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.input,
    borderRadius: radius.lg,
    borderWidth: 1,
    color: colors.foreground,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  // 매직링크 = PWA outline 버튼 parity — 2차 액션(테두리+배경).
  magicLinkButton: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  magicLinkLabel: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "700",
  },
  feedbackCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  feedbackSuccess: {
    borderColor: colors.primary,
  },
  feedbackError: {
    borderColor: colors.destructive,
  },
  feedbackText: {
    ...typography.body,
    color: colors.foreground,
  },
  feedbackTextError: {
    color: colors.destructive,
  },
});

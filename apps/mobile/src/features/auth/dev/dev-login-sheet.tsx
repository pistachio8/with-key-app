import { useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";

import { verifyMagicLinkToken } from "@/features/auth";

// 디버깅용 개발자 로그인 모드 — RN 숨긴 메뉴 (spec §5.4).
// login 의 "fromwith" kicker long-press 로 연다. __DEV__ 일 때만 존재(release strip).
// 토큰 교환은 기존 verifyMagicLinkToken 재사용 — admin secret 은 서버에만, RN 은 토큰만 받는다.

const DEV_ACCOUNTS = [
  { label: "멤버·진행중", email: "member-active@fromwith.test" },
  { label: "잔액 있음", email: "balance@fromwith.test" },
] as const;

interface DevLoginSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function DevLoginSheet({ visible, onClose }: DevLoginSheetProps) {
  const [pending, setPending] = useState<string | null>(null);
  if (!__DEV__) return null;

  const handlePick = async (email: string) => {
    // 값은 dev variant 에서만 app.config extra 에 주입된다(prod 번들엔 없음 — §5.4).
    const devLoginUrl = Constants.expoConfig?.extra?.devLoginUrl as string | undefined;
    const vercelBypass = Constants.expoConfig?.extra?.vercelBypass as string | undefined;

    if (!devLoginUrl) {
      Alert.alert("dev 로그인 불가", "EXPO_PUBLIC_DEV_LOGIN_URL 이 없어요 (dev variant 전용).");
      return;
    }

    setPending(email);
    try {
      // Preview Protection 을 bypass 토큰으로 통과 — 이 토큰이 사실상 dev 시크릿 역할(§4·D9).
      const res = await fetch(
        `${devLoginUrl}/auth/dev-login?email=${encodeURIComponent(email)}&format=token`,
        { headers: { "x-vercel-protection-bypass": vercelBypass ?? "" } },
      );

      if (!res.ok) {
        Alert.alert("dev 로그인 실패", `토큰 발급 응답 오류 (HTTP ${res.status})`);
        return;
      }

      // 비-JSON 응답 가드(§8): Preview SSO HTML·404·네트워크 우회 시 HTML 을 JSON.parse 하다
      // silently 깨지는 경로를 막고 명시 알림.
      const contentType = res.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        Alert.alert(
          "dev 로그인 실패",
          "비-JSON 응답 — Preview 인증 벽이나 잘못된 URL 일 수 있어요.",
        );
        return;
      }

      const body = (await res.json()) as { hashed_token?: string };
      if (!body.hashed_token) {
        Alert.alert("dev 로그인 실패", "응답에 토큰이 없어요.");
        return;
      }

      const result = await verifyMagicLinkToken(body.hashed_token);
      if (!result.ok) {
        Alert.alert("dev 로그인 실패", "토큰 검증에 실패했어요.");
        return;
      }
      // 성공: SessionProvider 가 세션 변화를 받아 로그인 화면을 이탈시킨다. 시트만 닫는다.
      onClose();
    } catch (error) {
      console.error("[dev-login] fetch failed:", error);
      Alert.alert("dev 로그인 실패", "네트워크 오류로 토큰을 받지 못했어요.");
    } finally {
      setPending(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>개발자 로그인</Text>
          <Text style={styles.subtitle}>테스트 계정을 골라 즉시 로그인 (dev 빌드 전용)</Text>
          {DEV_ACCOUNTS.map((account) => (
            <Pressable
              key={account.email}
              accessibilityRole="button"
              disabled={pending !== null}
              onPress={() => handlePick(account.email)}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            >
              <Text style={styles.itemLabel}>{account.label}</Text>
              <Text style={styles.itemEmail}>
                {pending === account.email ? "로그인 중…" : account.email}
              </Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    gap: 10,
  },
  title: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "800",
  },
  subtitle: {
    color: "#6B7280",
    fontSize: 13,
    marginBottom: 6,
  },
  item: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  itemPressed: {
    opacity: 0.7,
  },
  itemLabel: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "700",
  },
  itemEmail: {
    color: "#6B7280",
    fontSize: 12,
    marginTop: 2,
  },
});

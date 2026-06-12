// read 화면 공용 로딩/에러 상태 (EVAL-0017) — not-found 류 정적 안내는
// PlaceholderScreen 을 그대로 쓰고, 여기는 스피너와 재시도 버튼만 둔다.
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/shared/theme/colors";

export function LoadingScreen() {
  return (
    <View style={styles.center}>
      <ActivityIndicator />
    </View>
  );
}

type ReadErrorScreenProps = {
  title?: string;
  description?: string;
  onRetry: () => void;
};

export function ReadErrorScreen({
  title = "불러오지 못했어요",
  description = "네트워크 상태를 확인하고 다시 시도해 주세요.",
  onRetry,
}: ReadErrorScreenProps) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
      >
        <Text style={styles.retryLabel}>다시 시도</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  title: {
    color: colors.textStrong,
    fontSize: 18,
    fontWeight: "700",
  },
  description: {
    color: colors.textSubtle,
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: colors.textStrong,
    borderRadius: 12,
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  pressed: {
    opacity: 0.85,
  },
  retryLabel: {
    color: colors.inverse,
    fontSize: 15,
    fontWeight: "700",
  },
});

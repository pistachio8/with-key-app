// apps/mobile/src/shared/ui/error-state.tsx
// web components/ui/error-state.tsx 미러. 기본 문구 + 선택 재시도 버튼.
import { StyleSheet, Text, View } from "react-native";

import { typography } from "@/shared/theme/typography";

import { Button } from "./button";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({
  title = "문제가 발생했어요",
  description = "잠시 후 다시 시도해 주세요",
  onRetry,
  retryLabel = "다시 시도",
}: ErrorStateProps) {
  return (
    <View style={styles.wrap}>
      <Text style={typography.h3}>{title}</Text>
      <Text style={[typography.sub, styles.desc]}>{description}</Text>
      {onRetry ? (
        <Button variant="ghost" size="sm" onPress={onRetry} style={styles.btn}>
          {retryLabel}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 12, justifyContent: "center", paddingVertical: 48 },
  desc: { maxWidth: 280, textAlign: "center" },
  btn: { marginTop: 8 },
});

// apps/mobile/src/shared/ui/empty-state.tsx
// web components/ui/empty-state.tsx 미러. icon 은 RN 의존 회피 위해 optional ReactNode.
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { typography } from "@/shared/theme/typography";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      {icon}
      <Text style={typography.h3}>{title}</Text>
      {description ? <Text style={[typography.sub, styles.desc]}>{description}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 12, justifyContent: "center", paddingVertical: 48 },
  desc: { maxWidth: 280, textAlign: "center" },
  action: { marginTop: 8 },
});

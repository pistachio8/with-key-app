// apps/mobile/src/shared/ui/chip.tsx
// web components/ui/chip.tsx 미러. tone 5. /15·/12 alpha 는 rgba 로.
import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors } from "@/shared/theme/colors";

export type ChipTone = "neutral" | "primary" | "secondary" | "success" | "danger";

interface ChipProps {
  children: ReactNode;
  tone?: ChipTone;
  style?: StyleProp<ViewStyle>;
}

const TONE = {
  neutral: { bg: colors.muted, fg: colors.mutedForeground },
  primary: { bg: colors.brandPrimarySoft, fg: colors.primary },
  secondary: { bg: colors.brandSecondarySoft, fg: colors.foreground },
  success: { bg: "rgba(82,194,140,0.15)", fg: colors.brandSuccess }, // #52C28C/15
  danger: { bg: "rgba(255,107,107,0.12)", fg: colors.destructive }, // #FF6B6B/12
} as const;

export function Chip({ children, tone = "neutral", style }: ChipProps) {
  const t = TONE[tone];
  return (
    <View style={[styles.base, { backgroundColor: t.bg }, style]}>
      <Text style={[styles.label, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  label: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5 },
});

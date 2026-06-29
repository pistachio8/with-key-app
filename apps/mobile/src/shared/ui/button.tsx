// apps/mobile/src/shared/ui/button.tsx
// web components/ui/button.tsx 미러. variant 5 + size 3. 터치 타깃 ≥44px(RN 접근성).
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { colors } from "@/shared/theme/colors";
import { radius } from "@/shared/theme/radius";

export type ButtonVariant = "default" | "outline" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "default" | "sm" | "lg";

interface ButtonProps {
  children: ReactNode;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

// destructive 배경 = web bg-destructive/10 (10% alpha)
const DESTRUCTIVE_SOFT = "rgba(255,107,107,0.1)";

const VARIANT = {
  default: { bg: colors.primary, fg: colors.primaryForeground, border: "transparent" },
  outline: { bg: colors.background, fg: colors.foreground, border: colors.border },
  secondary: { bg: colors.secondary, fg: colors.secondaryForeground, border: "transparent" },
  ghost: { bg: "transparent", fg: colors.foreground, border: "transparent" },
  destructive: { bg: DESTRUCTIVE_SOFT, fg: colors.destructive, border: "transparent" },
} as const;

const SIZE = {
  default: { minHeight: 44, paddingHorizontal: 16, fontSize: 14 },
  sm: { minHeight: 44, paddingHorizontal: 12, fontSize: 13 },
  lg: { minHeight: 52, paddingHorizontal: 20, fontSize: 16 },
} as const;

export function Button({
  children,
  onPress,
  variant = "default",
  size = "default",
  disabled = false,
  style,
}: ButtonProps) {
  const v = VARIANT[variant];
  const s = SIZE[size];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: s.minHeight,
          paddingHorizontal: s.paddingHorizontal,
          backgroundColor: v.bg,
          borderColor: v.border,
        },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, { color: v.fg, fontSize: s.fontSize }]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  label: { fontWeight: "600" },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});

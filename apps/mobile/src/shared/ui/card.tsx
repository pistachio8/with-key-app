// apps/mobile/src/shared/ui/card.tsx
// web components/ui/card.tsx 미러. padding 4 + tone 3.
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { colors } from "@/shared/theme/colors";
import { radius } from "@/shared/theme/radius";

export type CardPadding = "none" | "sm" | "md" | "lg";
export type CardTone = "default" | "muted" | "primary";

interface CardProps {
  children: ReactNode;
  padding?: CardPadding;
  tone?: CardTone;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const PADDING = { none: 0, sm: 10, md: 14, lg: 20 } as const; // web p-2.5/3.5/5

export function Card({ children, padding = "md", tone = "default", style, testID }: CardProps) {
  const toneStyle =
    tone === "primary"
      ? { backgroundColor: colors.primary, borderColor: "transparent" }
      : tone === "muted"
        ? { backgroundColor: colors.muted, borderColor: "transparent" }
        : { backgroundColor: colors.card, borderColor: colors.border };
  return (
    <View
      testID={testID}
      style={[
        styles.base,
        tone === "default" && styles.shadow,
        { padding: PADDING[padding] },
        toneStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg, // 14
    borderWidth: 1,
  },
  // web shadow-[0_1px_2px_rgba(20,24,36,0.04)]
  shadow: {
    elevation: 1,
    shadowColor: "#141824",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
});

// apps/mobile/src/shared/ui/stamp.tsx
// web components/ui/stamp.tsx 미러 — 단, 회전 애니메이션 생략(정적). 스펙 §SL0.
// tone 4 또는 color prop 직접 주입(영수증 invite-stamp #4a3f37 용).
import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/shared/theme/colors";

export type StampTone = "primary" | "success" | "danger" | "onPrimary";
export type StampVariant = "label" | "wordmark";

interface StampProps {
  variant?: StampVariant;
  label?: string;
  tone?: StampTone;
  /** 직접 색 주입(예: 영수증 invite-stamp). 지정 시 tone 무시. */
  color?: string;
}

const TONE: Record<StampTone, string> = {
  primary: colors.primary,
  success: colors.brandSuccess,
  danger: colors.destructive,
  onPrimary: colors.primaryForeground,
};

export function Stamp({ variant = "label", label, tone = "primary", color }: StampProps) {
  const ink = color ?? TONE[tone];
  const accessibilityLabel = variant === "wordmark" ? (label ?? "from·with") : (label ?? "");
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[styles.base, { borderColor: ink }]}
    >
      {variant === "wordmark" ? (
        <>
          <View pointerEvents="none" style={[styles.innerRing, { borderColor: ink }]} />
          <Text style={[styles.from, { color: ink }]}>from</Text>
          <View style={[styles.divider, { backgroundColor: ink }]} />
          <Text style={[styles.with, { color: ink }]}>with</Text>
        </>
      ) : (
        <Text style={[styles.labelText, { color: ink }]}>{label}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: 9999,
    borderWidth: 3,
    height: 80,
    justifyContent: "center",
    width: 80,
  },
  innerRing: {
    borderRadius: 9999,
    borderWidth: 1,
    bottom: 2,
    left: 2,
    opacity: 0.45,
    position: "absolute",
    right: 2,
    top: 2,
  },
  from: { fontSize: 8, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },
  divider: { borderRadius: 9999, height: 2, marginVertical: 1, width: 24 },
  with: { fontSize: 11, fontWeight: "900", letterSpacing: -0.1, textTransform: "uppercase" },
  labelText: { fontSize: 13, fontWeight: "700", paddingHorizontal: 8, textAlign: "center" },
});

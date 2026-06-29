// apps/mobile/src/shared/theme/typography.ts
// web globals.css .t-* (:186-220) → RN TextStyle.
// letterSpacing = em × fontSize, lineHeight = ratio × fontSize (RN 은 절대 px).
import type { TextStyle } from "react-native";

import { colors } from "./colors";

export const typography = {
  h1: { fontSize: 28, fontWeight: "800", letterSpacing: -0.56, lineHeight: 33.6 },
  h2: { fontSize: 22, fontWeight: "700", letterSpacing: -0.22, lineHeight: 27.5 },
  h3: { fontSize: 18, fontWeight: "700", letterSpacing: -0.18, lineHeight: 23.4 },
  body: { fontSize: 14, fontWeight: "500", lineHeight: 21 },
  sub: { fontSize: 13, fontWeight: "500", lineHeight: 18.85, color: colors.mutedForeground },
  caption: { fontSize: 11, fontWeight: "600", letterSpacing: 0.44, color: colors.mutedForeground },
} satisfies Record<string, TextStyle>;

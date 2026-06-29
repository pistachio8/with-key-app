// apps/mobile/src/shared/theme/colors.ts
// web 디자인 시스템 정합 토큰 (SL0). SoT: apps/web/src/app/globals.css.
// globals.css 는 hex 가 SoT(:61-62) — 여기 값은 그 hex 를 그대로 옮긴 것이다.
// AA 보정된 muted/mutedForeground/brandPrimaryDeep 3개만 OKLCH(globals.css)를
// sRGB hex 로 변환한 값(theme.spec.ts 가 culori 로 일치 강제).
// 레거시 키(textStrong 등)는 기존 화면 비파괴용 alias — 후속 슬라이스에서 정리.
export const colors = {
  // 시맨틱 토큰 (globals.css hex SoT)
  background: "#F7F8FB",
  foreground: "#22262E",
  card: "#FFFFFF",
  cardForeground: "#22262E",
  primary: "#8AA4FF",
  primaryForeground: "#FFFFFF",
  secondary: "#FFD46B",
  secondaryForeground: "#22262E",
  accent: "#BCA6FF",
  accentForeground: "#22262E",
  destructive: "#FF6B6B",
  border: "#E8EBF0",
  // OKLCH SoT (AA 보정) → sRGB hex 변환
  muted: "#EEF0F4",
  mutedForeground: "#5F636C",
  // brand 계열
  brandPink: "#FFB6C6",
  brandWarn: "#FF8A4E",
  brandSuccess: "#52C28C",
  brandPrimarySoft: "#E8EDFF",
  brandSecondarySoft: "#FFF5DA",
  brandPrimaryDeep: "#708EE2",
  // 정산 영수증(invite) 팔레트 (globals.css:127-138, hex 직접 정의)
  invite: {
    bg: "#faf6ef",
    ink: "#2a221c",
    muted: "#5e4838",
    accent: "#b07a4d",
    gold: "#c9a878",
    line: "#e5d8c2",
    terra: "#c2683d",
    subtext: "#8e8579",
    dashline: "#c9c0b0",
    stamp: "#4a3f37",
  },
  // --- 레거시 alias (기존 화면 호환, 후속 정리) ---
  textStrong: "#22262E", // = foreground
  text: "#22262E", // = foreground
  textSubtle: "#5F636C", // = mutedForeground
  textMuted: "#5F636C", // = mutedForeground
  primarySoft: "#E8EDFF", // = brandPrimarySoft
  success: "#52C28C", // = brandSuccess
  warn: "#FF8A4E", // = brandWarn
  danger: "#FF6B6B", // = destructive
  inverse: "#FFFFFF", // = primaryForeground
} as const;

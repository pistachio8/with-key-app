// shared/theme — mobile 디자인 토큰 최소셋 (04 §5.1 shared/theme · 03 §5 "토큰 먼저").
// 기존 mobile 화면(EVAL-0012~0014)이 쓰던 hex 를 승격한 POC 팔레트 — 화면마다
// 하드코딩이 늘어나기 전에 한 곳으로 모은다. 정식 토큰 체계는 styling spec(03 §0.3) 후속.
export const colors = {
  background: "#F7FAFC",
  card: "#FFFFFF",
  border: "#E5E7EB",
  muted: "#F3F4F6",
  textStrong: "#111827",
  text: "#374151",
  textSubtle: "#4B5563",
  textMuted: "#6B7280",
  primary: "#0F766E",
  primarySoft: "#CCFBF1",
  success: "#15803D",
  warn: "#B45309",
  danger: "#B91C1C",
  inverse: "#F9FAFB",
} as const;

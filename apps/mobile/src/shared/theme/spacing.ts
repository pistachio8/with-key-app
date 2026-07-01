// apps/mobile/src/shared/theme/spacing.ts
// P0 화면 공통 spacing scale. web 은 Tailwind 기본 spacing 을 쓰므로 CSS SoT 는 없다 —
// 기존 native 화면(home·action·pledge 등)의 반복 padding/margin/gap 실측값을
// 8px 그리드(하위 4px 하프스텝 허용)로 정규화해 추출했다. theme.spec 이 그리드 정렬을 강제한다.
//
// 실측 빈도(apps/mobile/src grep, 2026-07-01): 12→31 · 16→25 · 8→24 · 4→16 · 24→16 · 32→6.
// off-grid 잔여값(10·6·14 등)은 화면 re-skin(EVAL-0068~)에서 이 scale 로 흡수 — 여기선 정규 scale 만 제공.
export const spacing = {
  xs: 4, // 0.5×8 — 타이트 간격(greeting 내부 paddingBottom 등)
  sm: 8, // 1×8 — greeting paddingTop
  md: 12, // 1.5×8 — 최빈 카드/리스트 gap (31회)
  lg: 16, // 2×8 — 화면 기본 padding (25회)
  xl: 24, // 3×8 — 섹션 간 간격 (16회)
  "2xl": 32, // 4×8 — ScrollView 하단 여백(paddingBottom)
} as const;

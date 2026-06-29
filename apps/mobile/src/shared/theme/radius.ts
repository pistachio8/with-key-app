// apps/mobile/src/shared/theme/radius.ts
// web globals.css --radius(14px) 파생 (:52-57). 값 = 14 × {0.6, 0.8, 1, 1.4, 1.8, 2.2}.
// 곱셈 부동소수점 드리프트(예: 14*1.4 = 19.599…)를 피해 파생값을 리터럴로 고정한다.
export const radius = {
  sm: 8.4, // 14 × 0.6
  md: 11.2, // 14 × 0.8
  lg: 14, // 14 × 1.0
  xl: 19.6, // 14 × 1.4
  "2xl": 25.2, // 14 × 1.8
  "3xl": 30.8, // 14 × 2.2
} as const;

// apps/mobile/src/shared/theme/motion.ts
// web globals.css --motion-* (:120-125). RN Easing.bezier 로 cubic-bezier 미러.
// 정산 도장 회전 애니메이션은 SL0 범위에서 정적 처리(생략) — duration 토큰은 화면 전이용 보존.
import { Easing } from "react-native";

export const motion = {
  duration: { fast: 120, base: 200, slow: 320, stamp: 520 },
  // --ease-out-soft: cubic-bezier(0.2, 0.8, 0.2, 1)
  easeOutSoft: Easing.bezier(0.2, 0.8, 0.2, 1),
  // --ease-in-soft: cubic-bezier(0.8, 0.2, 1, 0.6)
  easeInSoft: Easing.bezier(0.8, 0.2, 1, 0.6),
} as const;

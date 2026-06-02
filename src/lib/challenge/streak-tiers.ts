// 인증 완료 DaySlider 의 streak 채도 단계 산출 (spec 2026-05-29-action-streak-slider-confetti).
// tier = 그 날까지 끊김 없이 이어온 연속 인증 일수. MAX_TIER 에서 평탄화. 0 = 미인증.
// done-days.ts 와 동일하게 "1일 1회" 가 전제(인증일은 distinct 캘린더 일차).

const MAX_TIER = 7;

export function streakTiers(
  verifiedDays: ReadonlyArray<number>,
  totalDays: number,
): Map<number, number> {
  const verified = new Set(verifiedDays);
  const tiers = new Map<number, number>();
  let run = 0;
  for (let day = 1; day <= totalDays; day++) {
    if (verified.has(day)) {
      run += 1;
      tiers.set(day, Math.min(run, MAX_TIER));
    } else {
      run = 0;
      tiers.set(day, 0);
    }
  }
  return tiers;
}

import type { ActivityType } from "@withkey/domain";

// 결과 모달용 활동 명사(이모지 없음). other(기타)는 활동명을 생략하고 중립 문구를 쓴다.
const ACTIVITY_NOUN: Partial<Record<ActivityType, string>> = {
  running: "러닝",
  gym: "헬스",
  yoga: "요가",
  meal: "식단",
};

export function completedTitle(activityType: ActivityType): string {
  const noun = ACTIVITY_NOUN[activityType];
  return noun ? `오늘 ${noun} 인증 완료!` : "오늘 인증 완료!";
}

export function firstSuccessTitle(activityType: ActivityType): string {
  const noun = ACTIVITY_NOUN[activityType];
  return noun ? `첫 ${noun} 인증 성공!` : "첫 인증 성공!";
}

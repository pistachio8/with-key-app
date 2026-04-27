export const ACTIVITY_TYPES = ["running", "gym", "yoga", "other"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

// PRD §4.6 키워드 풀 v1 (POC 기간 변경 금지 — 분석 편향 방지).
// 수정이 필요하면 PO 승인 + Validation Plan 재논의.
export const KEYWORD_POOL: Record<ActivityType, readonly string[]> = {
  running: [
    "상쾌한",
    "땀범벅",
    "숨참",
    "느긋한",
    "페이스업",
    "새벽공기",
    "음악과함께",
    "혼자만의시간",
    "비맞음",
    "더위사냥",
    "강변뷰",
    "PR갱신",
  ],
  gym: [
    "가슴데이",
    "등데이",
    "하체데이",
    "스쿼트",
    "데드리프트",
    "펌핑",
    "PR도전",
    "무거운날",
    "가벼운날",
    "거울앞",
    "폼체크",
    "트레이너칭찬",
  ],
  yoga: [
    "명상",
    "스트레칭",
    "유연성",
    "버전업",
    "고요함",
    "밸런스",
    "호흡집중",
    "새벽요가",
    "피곤한날",
    "회복중",
    "하타",
    "인요가",
  ],
  other: [
    "땀나는",
    "기분좋은",
    "가벼운",
    "힘들었던",
    "동기부여",
    "재밌는",
    "루틴유지",
    "오늘만",
    "새로운시도",
    "무리안함",
    "짧게집중",
    "친구와함께",
  ],
} as const;

export function isValidKeyword(activityType: ActivityType, keyword: string): boolean {
  return KEYWORD_POOL[activityType].includes(keyword);
}

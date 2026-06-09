// 서약서 미리보기 카드의 "기간" 날짜 범위 표기 — KST(Asia/Seoul) 캘린더 일자 기준.
//
// 두 경우로 갈린다.
//   - active/closed: 실제 start_at ~ 마지막 인증일. end_at 은 ADR-0026 으로
//     "마지막 날 다음 KST 자정"(예: 7일 챌린지 6/1 시작 → end_at = 6/8 00:00 KST)
//     이므로 마지막 인증일 = end_at 의 KST 일자 − 1일(= 6/7).
//   - pending/accepted: 아직 활성화 전이라 end_at 이 NULL. 실제 시작일이 미정이므로
//     "오늘 시작 가정"으로 오늘 ~ 오늘+(duration−1) 을 추정치(isEstimate=true)로 그린다.
//
// 과거 버그: 끝을 `오늘 + durationDays`(= 8일째)로 찍어 7일 챌린지가 "6/1~6/8"(8칸)로
// 보였고, start_at/end_at 을 아예 안 봐서 이미 시작된 챌린지도 "오늘 기준"으로 그렸다.
import { toKstDayKey } from "./done-days";

export interface PledgeDateRange {
  /** "M/D ~ M/D" 형식의 날짜 범위 (시작일 ~ 마지막 인증일) */
  text: string;
  /** 활성화 전(pending/accepted)이라 실제 시작일 미정인 추정치이면 true */
  isEstimate: boolean;
}

// KST day key("YYYY-MM-DD") 를 days 만큼 이동. 한국은 DST 없음 → UTC 자정 산술로 안전
// (done-days.ts 의 kstDayDiff 와 동일한 근거).
function shiftKstDayKey(key: string, days: number): string {
  const ms = Date.parse(`${key}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

// "YYYY-MM-DD" → "M/D" (앞 0 제거).
function kstKeyToMonthDay(key: string): string {
  const [, month, day] = key.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function formatPledgeDateRange(args: {
  durationDays: number;
  startAt: string | null;
  endAt: string | null;
  now?: Date;
}): PledgeDateRange {
  const { durationDays, startAt, endAt, now = new Date() } = args;

  // active/closed — 실제 날짜. 마지막 인증일 = end_at(다음 날 KST 자정)의 KST 일자 − 1일.
  if (startAt && endAt) {
    const startKey = toKstDayKey(startAt);
    const lastDayKey = shiftKstDayKey(toKstDayKey(endAt), -1);
    return {
      text: `${kstKeyToMonthDay(startKey)} ~ ${kstKeyToMonthDay(lastDayKey)}`,
      isEstimate: false,
    };
  }

  // pending/accepted — 활성화 전(end_at NULL). 오늘 시작 가정 추정치.
  const startKey = toKstDayKey(now);
  const lastDayKey = shiftKstDayKey(startKey, durationDays - 1);
  return {
    text: `${kstKeyToMonthDay(startKey)} ~ ${kstKeyToMonthDay(lastDayKey)}`,
    isEstimate: true,
  };
}

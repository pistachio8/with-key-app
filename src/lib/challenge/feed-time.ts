// 인증 피드 타임스탬프 표기 — 24시간 미만은 상대 시간, 그 이후는 KST 캘린더 일자.
// 경과 시간(elapsed) 기준이며 캘린더 자정 기준이 아니다("하루가 지나면" = 24h 경과).
// createdAt(immutable ISO)만 입력으로 받아 캐시에 안전하다 — 상대 시간 label 자체는
// 캐시에 저장하지 않고 render 시점(RSC)의 now 로 계산한다.
// 한국은 DST 없음 — Intl.DateTimeFormat 의 timeZone='Asia/Seoul' 로 안전.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// home-greeting 과 동일한 포맷 컨벤션(`5월 28일`).
const kstMonthDay = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
});

function toKstMonthDayLabel(d: Date): string {
  const parts = kstMonthDay.formatToParts(d);
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${month} ${day}일`;
}

export function formatFeedTimestamp(createdAt: string, now: Date = new Date()): string {
  const created = new Date(createdAt).getTime();
  // 시계 오차로 created 가 미래면 음수 — "방금 전" 으로 흡수.
  const diff = Math.max(0, now.getTime() - created);
  if (diff < MINUTE) return "방금 전";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}분 전`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}시간 전`;
  return toKstMonthDayLabel(new Date(created));
}

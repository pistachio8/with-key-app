// 챌린지 인증 카운트 SoT — "피드 1행 = 인증 1회" 가 아니라
// "KST(Asia/Seoul) 자정 기준 distinct 캘린더 일자 수" 가 인증 횟수.
// 같은 날 N개 피드를 올려도 인증은 1회로만 카운트한다.
// 한국은 DST 없음 — Intl.DateTimeFormat 의 timeZone='Asia/Seoul' 로 안전.

const kstDateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });

export function toKstDayKey(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return kstDateFormatter.format(d);
}

export function countDoneDaysByUser(
  logs: ReadonlyArray<{ user_id: string; created_at: string }>,
): Map<string, number> {
  const daysByUser = new Map<string, Set<string>>();
  for (const l of logs) {
    let s = daysByUser.get(l.user_id);
    if (!s) {
      s = new Set<string>();
      daysByUser.set(l.user_id, s);
    }
    s.add(toKstDayKey(l.created_at));
  }
  const out = new Map<string, number>();
  for (const [u, days] of daysByUser) out.set(u, days.size);
  return out;
}

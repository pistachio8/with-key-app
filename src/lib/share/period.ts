const KST = "Asia/Seoul";

function parts(iso: string): { y: number; m: number; d: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const p = fmt.formatToParts(new Date(iso));
  const get = (type: string) => Number(p.find((x) => x.type === type)?.value ?? "0");
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** 공유 카드용 기간 표기. 같은 해는 연도 1회, 해 넘김은 양쪽. KST 기준. */
export function formatSharePeriod(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return "";
  const s = parts(startIso);
  const e = parts(endIso);
  if (s.y === e.y) return `${s.y}.${s.m}.${s.d} – ${e.m}.${e.d}`;
  return `${s.y}.${s.m}.${s.d} – ${e.y}.${e.m}.${e.d}`;
}

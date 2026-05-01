// PRD §10 화면 8 · §11.1~.2 — 결과 헤더. Design Brief §1.4 완곡 톤.

interface RecapHeroProps {
  title: string;
  startAt: string | null;
  endAt: string | null;
  viewerAchieved: boolean;
  anyoneAchieved: boolean;
}

// ko-KR / Asia/Seoul 로 `MM.DD` 를 생성. Node ICU 의 ko-KR은
// "05. 01." 처럼 literal 을 끼워 넣으므로 parts 에서 month/day 만 결합.
function formatMonthDay(iso: string): string {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${month}.${day}`;
}

function formatRange(startAt: string | null, endAt: string | null): string {
  if (!startAt || !endAt) return "";
  return `${formatMonthDay(startAt)} ~ ${formatMonthDay(endAt)}`;
}

function verdictLabel(viewerAchieved: boolean, anyoneAchieved: boolean): string {
  if (viewerAchieved) return "목표 달성!";
  if (anyoneAchieved) return "이번 주는 아쉬웠어요";
  return "다음 주엔 같이 해봐요";
}

export function RecapHero({
  title,
  startAt,
  endAt,
  viewerAchieved,
  anyoneAchieved,
}: RecapHeroProps) {
  return (
    <header className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs font-medium">주간 정산</p>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-muted-foreground text-sm">{formatRange(startAt, endAt)}</p>
      <p className="text-primary text-lg font-semibold" data-testid="recap-verdict">
        {verdictLabel(viewerAchieved, anyoneAchieved)}
      </p>
    </header>
  );
}

// PRD §10 화면 8 · 모킹업 §11 - 결과 헤더. Trophy 썸네일 + 완곡 톤 카피.

import { Trophy } from "lucide-react";

interface RecapHeroProps {
  title: string;
  startAt: string | null;
  endAt: string | null;
  viewerAchieved: boolean;
  anyoneAchieved: boolean;
  // 솔로(=1 참가자) 미달성 시 "같이 해봐요" 카피 부적절.
  isSolo?: boolean;
}

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

function verdictLabel(viewerAchieved: boolean, anyoneAchieved: boolean, isSolo: boolean): string {
  if (viewerAchieved) return "챌린지가 종료되었어요!";
  if (isSolo) return "다음엔 다시 도전해봐요";
  if (anyoneAchieved) return "이번엔 아쉬웠어요";
  return "다음엔 같이 해봐요";
}

export function RecapHero({
  title,
  startAt,
  endAt,
  viewerAchieved,
  anyoneAchieved,
  isSolo = false,
}: RecapHeroProps) {
  return (
    <header className="flex flex-col items-center gap-3 pt-2 text-center">
      <div className="bg-brand-primary-soft text-primary flex size-16 items-center justify-center rounded-full">
        <Trophy className="size-7" aria-hidden="true" />
      </div>
      <p className="text-muted-foreground t-caption">{formatRange(startAt, endAt)}</p>
      <h1 className="t-h1 font-bold">{title}</h1>
      <p className="text-primary t-body font-semibold" data-testid="recap-verdict">
        {verdictLabel(viewerAchieved, anyoneAchieved, isSolo)}
      </p>
    </header>
  );
}

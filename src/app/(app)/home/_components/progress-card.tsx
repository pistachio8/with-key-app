import { formatKRW } from "@/lib/challenge/penalty";

type Props = {
  title: string;
  goalCount: number;
  doneCount: number;
  potTotal: number;
  daysLeft: number;
};

// PRD §4 · Design Brief 화면 4
export function ProgressCard({ title, goalCount, doneCount, potTotal, daysLeft }: Props) {
  const progress =
    goalCount > 0 ? Math.min(100, Math.max(0, Math.round((doneCount / goalCount) * 100))) : 0;
  const dayLabel = daysLeft >= 0 ? `D-${daysLeft}` : "종료";
  return (
    <article className="bg-card rounded-2xl border p-5 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="text-muted-foreground text-xs font-medium">{dayLabel}</span>
      </header>
      <p className="text-3xl font-black tabular-nums">
        {doneCount}
        <span className="text-muted-foreground text-lg">/{goalCount}회</span>
      </p>
      <div
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${title} 진행률`}
        className="bg-muted mt-3 h-2 w-full overflow-hidden rounded-full"
      >
        <div className="bg-primary h-full transition-[width]" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-muted-foreground mt-3 text-sm">
        모인 예정 벌금{" "}
        <span className="text-foreground font-semibold tabular-nums">{formatKRW(potTotal)}</span>
      </p>
    </article>
  );
}

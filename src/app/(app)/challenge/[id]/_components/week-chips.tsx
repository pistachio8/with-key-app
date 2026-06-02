// spec C6 — 주차별 기록 칩(H3 주인공). viewer 개인 주차 상태.
// 달성(primary-soft) · 미달(warn 틴트) · 현재 주(점선) · 미래 주(중립).
import { cn } from "@/lib/utils";
import type { WeekChip } from "@/lib/challenge/weekly";

const STATE_CLASS: Record<WeekChip["state"], string> = {
  achieved: "border-primary/20 bg-primary/10 text-primary",
  missed: "border-brand-warn/20 bg-brand-warn/10 text-brand-warn",
  current: "border-dashed border-primary/40 text-foreground",
  future: "border-transparent bg-muted text-muted-foreground",
};

export function WeekChips({ weeks }: { weeks: ReadonlyArray<WeekChip> }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="주차별 기록">
      {weeks.map((c) => (
        <li
          key={c.week}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-semibold tabular-nums",
            STATE_CLASS[c.state],
          )}
        >
          {c.week}주 {c.done}/{c.goal}
        </li>
      ))}
    </ul>
  );
}

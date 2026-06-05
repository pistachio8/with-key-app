import { cn } from "@/lib/utils";

interface KeywordSlice {
  label: string;
  value: number;
  color: string;
}

interface KeywordDonutProps {
  slices: KeywordSlice[];
  title: string;
  className?: string;
}

export function KeywordDonut({ slices, title, className }: KeywordDonutProps) {
  const stops: string[] = [];
  let cursor = 0;
  for (const s of slices) {
    const next = cursor + s.value;
    stops.push(`${s.color} ${(cursor * 360).toFixed(2)}deg ${(next * 360).toFixed(2)}deg`);
    cursor = next;
  }
  const conic = `conic-gradient(${stops.join(", ")})`;

  return (
    <div
      className={cn(
        "flex w-[220px] items-center justify-between rounded-[14px] border border-border/60 bg-card p-3.5",
        className,
      )}
    >
      <div className="t-body font-semibold">{title}</div>
      <div
        className="relative size-12 rounded-full"
        style={{ background: conic }}
        aria-hidden="true"
      >
        <span className="absolute inset-[6px] rounded-full bg-card" />
      </div>
    </div>
  );
}

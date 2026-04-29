"use client";

import { cn } from "@/lib/utils";

type Props = {
  shown: string[];
  selected: string[];
  onChange: (next: string[]) => void;
};

// Design Brief §5 Keyword Chip Group · 1~3개 · 4개째 선택 시 가장 오래된 항목 자동 해제
export function KeywordChipGroup({ shown, selected, onChange }: Props) {
  function toggle(kw: string) {
    if (selected.includes(kw)) {
      onChange(selected.filter((k) => k !== kw));
      return;
    }
    if (selected.length >= 3) {
      onChange([...selected.slice(1), kw]);
      return;
    }
    onChange([...selected, kw]);
  }
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="키워드 선택">
      {shown.map((kw) => {
        const on = selected.includes(kw);
        return (
          <button
            key={kw}
            type="button"
            onClick={() => toggle(kw)}
            aria-pressed={on}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              on
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {kw}
          </button>
        );
      })}
    </div>
  );
}

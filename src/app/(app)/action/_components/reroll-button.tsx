"use client";

import { Dices } from "lucide-react";
import { REROLL_LIMIT } from "@/lib/keywords/shuffle";
import { cn } from "@/lib/utils";

type Props = { rerollCount: number; onClick: () => void };

export function RerollButton({ rerollCount, onClick }: Props) {
  const remaining = Math.max(0, REROLL_LIMIT - rerollCount);
  const disabled = remaining <= 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`다시 뽑기 (남은 횟수 ${remaining}/${REROLL_LIMIT})`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        disabled
          ? "text-muted-foreground cursor-not-allowed opacity-60"
          : "bg-muted hover:bg-muted/80",
      )}
    >
      <Dices className="size-4" aria-hidden="true" />
      다시 뽑기{" "}
      <span className="tabular-nums">
        {remaining}/{REROLL_LIMIT}
      </span>
    </button>
  );
}

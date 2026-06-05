"use client";

// 모킹업 §8-A `.react` — 3 이모지 항상 노출. PRD §7.3 AC-1·AC-4 호응.
// B11 결정: "+" 버튼 제거, `👍` (모킹업) → `💪` (PRD) 매핑.

import { cn } from "@/lib/utils";
import { KUDOS_EMOJIS, type KudosEmoji } from "@/lib/validators/kudos";

interface KudosBarProps {
  counts: Readonly<Partial<Record<KudosEmoji, number>>>;
  viewerKudos: ReadonlyArray<KudosEmoji>;
  onToggle: (emoji: KudosEmoji) => void;
  disabled?: boolean;
}

export function KudosBar({ counts, viewerKudos, onToggle, disabled = false }: KudosBarProps) {
  return (
    <div className="mt-2 flex items-center gap-2.5">
      {KUDOS_EMOJIS.map((emoji) => {
        const count = counts[emoji] ?? 0;
        const mine = viewerKudos.includes(emoji);
        return (
          <button
            key={emoji}
            type="button"
            disabled={disabled}
            aria-pressed={mine}
            aria-label={`${emoji} 응원 ${count}${mine ? " · 내가 누름" : ""}`}
            onClick={() => onToggle(emoji)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 transition-transform duration-[var(--motion-fast)]",
              "active:scale-90 disabled:pointer-events-none disabled:opacity-50",
              "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
            )}
          >
            <span aria-hidden="true" className="text-[14px] leading-none">
              {emoji}
            </span>
            <span
              className={cn(
                "text-[11px] tabular-nums",
                mine ? "text-foreground font-bold" : "text-muted-foreground font-normal",
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

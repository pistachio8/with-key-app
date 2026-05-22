"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { PENALTY_PRESETS, formatKRW, penaltyLabel } from "@/lib/challenge/penalty";
import { cn } from "@/lib/utils";

type Props = { value: number; onChange: (amount: number) => void };

export function PenaltyPicker({ value, onChange }: Props) {
  const legendId = useId();
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusIndex = (index: number) => {
    const clamped = (index + PENALTY_PRESETS.length) % PENALTY_PRESETS.length;
    const el = radioRefs.current[clamped];
    el?.focus();
    onChange(PENALTY_PRESETS[clamped]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        focusIndex(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        focusIndex(index - 1);
        break;
      case "Home":
        e.preventDefault();
        focusIndex(0);
        break;
      case "End":
        e.preventDefault();
        focusIndex(PENALTY_PRESETS.length - 1);
        break;
      case " ":
      case "Enter":
        e.preventDefault();
        onChange(PENALTY_PRESETS[index]);
        break;
    }
  };

  return (
    <fieldset className="flex flex-col gap-3">
      <legend id={legendId} className="text-sm font-semibold">
        1회 실패 시 예정 벌금
      </legend>
      <div
        role="radiogroup"
        aria-labelledby={legendId}
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {PENALTY_PRESETS.map((amount, index) => {
          const checked = value === amount;
          return (
            <button
              key={amount}
              ref={(el) => {
                radioRefs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => onChange(amount)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={cn(
                "min-h-12 rounded-xl border px-3 py-3 text-sm font-semibold tabular-nums transition-colors",
                "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                checked
                  ? "bg-secondary text-secondary-foreground border-secondary"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {penaltyLabel(amount)}
            </button>
          );
        })}
      </div>
      <p className="text-muted-foreground text-xs">
        {value === 0
          ? "강제력 없이 가볍게 시작해요"
          : `인증 못한 날 ${formatKRW(value)}이 자동으로 누적돼요`}
      </p>
    </fieldset>
  );
}

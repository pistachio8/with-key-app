"use client";

import { useId } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { goalCountLabel } from "@withkey/domain";

// 모킹업 §3-A "인증 빈도" — − / 박스 / + stepper. 1..7 범위.

interface FrequencyStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  className?: string;
  label?: string;
}

export function FrequencyStepper({
  value,
  onChange,
  min = 1,
  max = 7,
  className,
  label = "인증 빈도",
}: FrequencyStepperProps) {
  const id = useId();
  const { primary, helper } = goalCountLabel(value);
  const atMin = value <= min;
  const atMax = value >= max;

  function step(direction: -1 | 1) {
    const next = value + direction;
    if (next < min || next > max) return;
    onChange(next);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    }
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span id={`${id}-label`} className="t-caption">
        {label}
      </span>
      <div role="group" aria-labelledby={`${id}-label`} className="flex items-center gap-1.5">
        <StepButton
          ariaLabel={`${label} 줄이기`}
          icon={Minus}
          onClick={() => step(-1)}
          disabled={atMin}
        />
        <div
          role="spinbutton"
          tabIndex={0}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={`${primary} · ${helper}`}
          aria-labelledby={`${id}-label`}
          onKeyDown={onKeyDown}
          className={cn(
            "bg-background border-border/40 flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[10px] border py-2 transition-colors",
            "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          )}
        >
          <span className="text-[13px] font-semibold tabular-nums">{primary}</span>
          <span className="text-muted-foreground text-[10px] font-normal">{helper}</span>
        </div>
        <StepButton
          ariaLabel={`${label} 늘리기`}
          icon={Plus}
          onClick={() => step(1)}
          disabled={atMax}
        />
      </div>
    </div>
  );
}

interface StepButtonProps {
  ariaLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
}

function StepButton({ ariaLabel, icon: Icon, onClick, disabled }: StepButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "border-border/60 bg-card text-foreground/85 inline-flex size-9 shrink-0 items-center justify-center rounded-full border transition-transform",
        "hover:bg-muted focus-visible:ring-ring active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}

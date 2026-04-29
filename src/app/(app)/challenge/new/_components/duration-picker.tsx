"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { DURATION_PRESETS, MAX_DURATION_DAYS } from "@/lib/challenge/duration";
import { cn } from "@/lib/utils";

type Option = { kind: "preset"; label: string; days: number } | { kind: "custom"; label: string };

const optionClass = (checked: boolean) =>
  cn(
    "min-h-12 flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors",
    "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    checked
      ? "bg-primary text-primary-foreground border-primary"
      : "bg-muted text-muted-foreground hover:bg-muted/80",
  );

type Props = { value: number; onChange: (days: number) => void };

export function DurationPicker({ value, onChange }: Props) {
  const legendId = useId();
  const hintId = useId();
  const isPreset = DURATION_PRESETS.some((p) => p.days === value);
  const [custom, setCustom] = useState(!isPreset);
  const customInputRef = useRef<HTMLInputElement | null>(null);
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const options: Option[] = [
    ...DURATION_PRESETS.map((p) => ({ kind: "preset" as const, label: p.label, days: p.days })),
    { kind: "custom", label: "직접 선택" },
  ];

  const selectedIndex = custom
    ? options.length - 1
    : options.findIndex((o) => o.kind === "preset" && o.days === value);

  const selectOption = (index: number) => {
    const opt = options[index];
    if (opt.kind === "preset") {
      setCustom(false);
      onChange(opt.days);
    } else {
      setCustom(true);
      // Focus the custom input on next paint so SR announces the appearing input.
      queueMicrotask(() => customInputRef.current?.focus());
    }
  };

  const focusIndex = (index: number) => {
    const clamped = (index + options.length) % options.length;
    radioRefs.current[clamped]?.focus();
    selectOption(clamped);
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
        focusIndex(options.length - 1);
        break;
      case " ":
      case "Enter":
        e.preventDefault();
        selectOption(index);
        break;
    }
  };

  return (
    <fieldset className="flex flex-col gap-3">
      <legend id={legendId} className="text-sm font-semibold">
        얼마 동안 진행할까요?
      </legend>
      <div role="radiogroup" aria-labelledby={legendId} className="flex flex-wrap gap-2">
        {options.map((opt, index) => {
          const checked = index === selectedIndex;
          return (
            <button
              key={opt.kind === "preset" ? opt.days : "custom"}
              ref={(el) => {
                radioRefs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => selectOption(index)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={optionClass(checked)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {custom && (
        <label className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">일수</span>
          <input
            ref={customInputRef}
            type="number"
            min={1}
            max={MAX_DURATION_DAYS}
            value={value}
            aria-describedby={hintId}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange(Math.max(1, Math.min(MAX_DURATION_DAYS, n)));
            }}
            className="w-24 rounded-lg border px-3 py-2 text-right tabular-nums focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          />
          <span id={hintId} className="text-muted-foreground text-xs">
            1일부터 {MAX_DURATION_DAYS}일까지 입력 (범위를 벗어나면 자동 조정돼요)
          </span>
        </label>
      )}
    </fieldset>
  );
}

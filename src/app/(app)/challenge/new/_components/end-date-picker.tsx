"use client";

import { useId, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";
import { ko } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import "react-day-picker/style.css";

// 모킹업 §3-A "진행 기간" — 3 preset pill + 캘린더 트리거.
// Q13 정책: 사용자 종료일 선택, 최소 1주(오늘 기준), 최대 3개월.

const PRESETS = [7, 14, 30] as const;
const MIN_DAYS = 7;
const MAX_DAYS = 90;

interface EndDatePickerProps {
  value: number;
  onChange: (next: number) => void;
  className?: string;
}

export function EndDatePicker({ value, onChange, className }: EndDatePickerProps) {
  const id = useId();
  const today = startOfDay(new Date());
  const minDate = addDays(today, MIN_DAYS);
  const maxDate = addDays(today, MAX_DAYS);
  const endDate = addDays(today, value);
  const [open, setOpen] = useState(false);
  const isPreset = (PRESETS as readonly number[]).includes(value);

  function handleSelectDate(date: Date | undefined) {
    if (!date) return;
    const days = differenceInCalendarDays(date, today);
    if (days < MIN_DAYS || days > MAX_DAYS) return;
    onChange(days);
    setOpen(false);
  }

  return (
    <fieldset className={cn("flex flex-col gap-1.5", className)}>
      <legend id={`${id}-label`} className="t-caption">
        진행 기간
      </legend>
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex gap-1.5">
        {PRESETS.map((d) => {
          const checked = value === d;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => {
                onChange(d);
                setOpen(false);
              }}
              className={cn(
                "min-h-11 flex-1 rounded-full border text-[13px] font-semibold transition-colors",
                "focus-visible:ring-ring active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                checked
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/60 bg-card text-foreground/85 hover:bg-muted",
              )}
            >
              {d}일
            </button>
          );
        })}
        <button
          type="button"
          aria-label="종료일 직접 선택"
          aria-expanded={open}
          aria-pressed={!isPreset || open}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "inline-flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors",
            "focus-visible:ring-ring active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            !isPreset || open
              ? "border-primary bg-brand-primary-soft text-primary"
              : "border-border/60 bg-card text-foreground/85 hover:bg-muted",
          )}
        >
          <CalendarIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
      {open && (
        <Card padding="md" className="mt-1 flex justify-center">
          <DayPicker
            mode="single"
            selected={isPreset ? undefined : endDate}
            onSelect={handleSelectDate}
            disabled={[{ before: minDate }, { after: maxDate }]}
            locale={ko}
            showOutsideDays={false}
          />
        </Card>
      )}
      <p className="text-muted-foreground text-[10px]">
        종료일:{" "}
        <span className="text-foreground font-semibold tabular-nums">
          {format(endDate, "yyyy년 M월 d일 (EEE)", { locale: ko })}
        </span>
        {" · "}오늘부터 {value}일 (최소 1주 ~ 최대 3개월)
      </p>
    </fieldset>
  );
}

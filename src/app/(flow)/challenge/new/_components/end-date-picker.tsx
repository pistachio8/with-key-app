"use client";

import { useEffect, useId, useRef, useState } from "react";
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
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // 외부 영역 클릭으로만 close — preset/날짜 선택은 popup 유지.
  // popoverRef(캘린더 Card)·triggerRef(아이콘) 외부 mousedown 시에만 닫는다.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function handleSelectDate(date: Date | undefined) {
    if (!date) return;
    const days = differenceInCalendarDays(date, today);
    if (days < MIN_DAYS || days > MAX_DAYS) return;
    onChange(days);
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
              onClick={() => onChange(d)}
              className={cn(
                "min-h-11 flex-1 rounded-full border text-[13px] font-semibold transition-colors",
                "focus-visible:ring-ring active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                checked
                  ? "border-secondary bg-secondary text-secondary-foreground"
                  : "border-border/60 bg-card text-foreground/85 hover:bg-muted",
              )}
            >
              {d}일
            </button>
          );
        })}
        <button
          ref={triggerRef}
          type="button"
          aria-label="종료일 직접 선택"
          aria-expanded={open}
          aria-pressed={!isPreset || open}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "inline-flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors",
            "focus-visible:ring-ring active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            !isPreset || open
              ? "border-secondary bg-secondary text-secondary-foreground"
              : "border-border/60 bg-card text-foreground/85 hover:bg-muted",
          )}
        >
          <CalendarIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div ref={popoverRef} className="mt-1 flex justify-center">
          <Card padding="md">
            <DayPicker
              className="dp-with-key"
              mode="single"
              selected={endDate}
              onSelect={handleSelectDate}
              disabled={[{ before: minDate }, { after: maxDate }]}
              locale={ko}
              navLayout="around"
              showOutsideDays={false}
              modifiers={{
                rangeStart: today,
                rangeMiddle: { after: today, before: endDate },
                rangeEnd: endDate,
              }}
              modifiersClassNames={{
                rangeStart: "day-range-start",
                rangeMiddle: "day-range-middle",
                rangeEnd: "day-range-end",
              }}
            />
          </Card>
        </div>
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

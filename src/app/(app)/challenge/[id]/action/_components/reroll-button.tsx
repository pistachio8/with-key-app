"use client";

// 모킹업 §10-A 라인 985 — "다시 생성" 헤더 row 우측. F11 결정:
// 평소엔 카운터 숨김, 5회(REROLL_LIMIT) 도달 시점에만 한 줄 helper "다시 생성은 N회까지".

import { RotateCcw } from "lucide-react";
import { REROLL_LIMIT } from "@/lib/keywords/shuffle";
import { cn } from "@/lib/utils";

type Props = { rerollCount: number; onClick: () => void; disabled?: boolean };

export function RerollButton({ rerollCount, onClick, disabled = false }: Props) {
  const remaining = Math.max(0, REROLL_LIMIT - rerollCount);
  const atMax = remaining <= 0;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={onClick}
        disabled={atMax || disabled}
        aria-label={
          atMax
            ? "다시 생성 (남은 횟수 없음)"
            : `다시 생성 (남은 횟수 ${remaining}/${REROLL_LIMIT})`
        }
        className={cn(
          "border-border/60 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-transform duration-[var(--motion-fast)]",
          "hover:bg-muted active:scale-95",
          "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        <RotateCcw className="size-3" aria-hidden="true" /> 다시 생성
      </button>
      {atMax && (
        <span className="text-muted-foreground text-[10px]">다시 생성은 {REROLL_LIMIT}회까지</span>
      )}
    </div>
  );
}

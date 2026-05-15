"use client";

// 모킹업 §10-B 라인 1005~1009 — 1~N day 가로 슬라이드. currentDay 중앙 정렬.
// Q6 결정: 마운트당 1회 슬라이드→정지 (모킹업 메모는 "무한 루프"였으나 dogfood 시선 산만 회피).
// reduced-motion 사용자에겐 즉시 정적 (애니메이션 생략).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface DaySliderProps {
  totalDays: number;
  currentDay: number;
}

// SSR 시 useLayoutEffect 경고 회피 — 클라이언트만 동작하면 충분.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function DaySlider({ totalDays, currentDay }: DaySliderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [targetX, setTargetX] = useState(0);
  const [animate, setAnimate] = useState(false);
  const days = Array.from({ length: totalDays }, (_, i) => i + 1);

  useIsoLayoutEffect(() => {
    const container = containerRef.current;
    const track = trackRef.current;
    if (!container || !track) return;
    const firstChip = track.querySelector<HTMLElement>("[data-day]");
    if (!firstChip) return;
    const chipFullWidth = firstChip.offsetWidth + 6; // gap 1.5 = 6px (tailwind)
    const containerCenter = container.clientWidth / 2;
    const targetCenter = (currentDay - 0.5) * chipFullWidth;
    const offset = containerCenter - targetCenter;
    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setAnimate(false);
      setTargetX(offset);
      return;
    }
    // 초기 0 → next frame 에서 targetX 로 → CSS transition 발화.
    setTargetX(0);
    setAnimate(false);
    const id = requestAnimationFrame(() => {
      setAnimate(true);
      setTargetX(offset);
    });
    return () => cancelAnimationFrame(id);
  }, [currentDay, totalDays]);

  return (
    <div ref={containerRef} className="bg-muted overflow-hidden rounded-[12px] px-2 py-3">
      <div
        ref={trackRef}
        className={cn(
          "flex w-max items-center gap-1.5",
          animate && "transition-transform duration-[3000ms] ease-[var(--ease-out-soft)]",
        )}
        style={{ transform: `translate3d(${targetX}px, 0, 0)` }}
      >
        {days.map((d) => {
          const active = d === currentDay;
          return (
            <span
              key={d}
              data-day={d}
              data-active={active}
              className={cn(
                "text-muted-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                "data-[active=true]:bg-primary data-[active=true]:text-primary-foreground",
              )}
            >
              {d}
            </span>
          );
        })}
      </div>
    </div>
  );
}

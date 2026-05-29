"use client";

// 모킹업 §10-B — 1..N day 가로 슬라이드. currentDay 중앙 정렬 + streak 채도.
// 인증한 과거 일자는 streak 단계(1..7)로 채도, 오늘은 금색 링, 미인증/미래는 구분 표기.
// 슬라이드는 마운트당 1회. 거리(currentDay)가 멀수록 시간을 천천히 늘려(속도↑) 3.2s 상한.
// reduced-motion 사용자에겐 즉시 정적(애니메이션 생략). 도착 시 onArrive 1회 호출.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { streakTiers } from "@/lib/challenge/streak-tiers";

interface DaySliderProps {
  totalDays: number;
  currentDay: number;
  verifiedDays?: ReadonlyArray<number>;
  /** 슬라이드가 currentDay 에 도착했을 때 1회 호출(reduced-motion 이면 즉시). */
  onArrive?: () => void;
}

// SSR 시 useLayoutEffect 경고 회피.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// 안정적 빈 배열 — verifiedDays 미지정 시 useMemo 의존성이 매 렌더 바뀌지 않도록.
const EMPTY_DAYS: ReadonlyArray<number> = [];

// 8일차 ≈ 2.0s 앵커, sub-linear 증가(거리↑ 시 속도↑), 1.6~3.2s clamp.
function slideDurationMs(currentDay: number): number {
  const ms = 2000 * Math.pow(Math.max(currentDay, 1) / 8, 0.4);
  return Math.round(Math.min(3200, Math.max(1600, ms)));
}

function chipStyle(tier: number, day: number, currentDay: number): CSSProperties {
  const ring: CSSProperties =
    day === currentDay ? { boxShadow: "0 0 0 2px var(--muted), 0 0 0 4px var(--secondary)" } : {};
  if (tier >= 1) {
    return {
      backgroundColor: `var(--streak-${tier})`,
      color: tier >= 5 ? "#fff" : "var(--foreground)",
      ...ring,
    };
  }
  if (day > currentDay) {
    return { border: "1px dashed var(--border)", color: "var(--muted-foreground)", ...ring };
  }
  // 미인증 과거일 — muted 컨테이너 위라 옅은 테두리로 구분.
  return {
    backgroundColor: "var(--muted)",
    border: "1px solid var(--border)",
    color: "var(--muted-foreground)",
    ...ring,
  };
}

function chipLabel(day: number, tier: number, currentDay: number): string {
  const status = tier >= 1 ? "인증함" : "미인증";
  return day === currentDay ? `${day}일차, 오늘 ${status}` : `${day}일차, ${status}`;
}

export function DaySlider({
  totalDays,
  currentDay,
  verifiedDays = EMPTY_DAYS,
  onArrive,
}: DaySliderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const firedRef = useRef(false);
  // onArrive 를 ref 로 보관 — effect deps 에서 제외해 부모의 inline 콜백이 재슬라이드를 유발하지 않게.
  const onArriveRef = useRef(onArrive);
  useEffect(() => {
    onArriveRef.current = onArrive;
  });

  const [targetX, setTargetX] = useState(0);
  const [animate, setAnimate] = useState(false);

  const days = Array.from({ length: totalDays }, (_, i) => i + 1);
  const tiers = useMemo(() => streakTiers(verifiedDays, totalDays), [verifiedDays, totalDays]);
  const durationMs = slideDurationMs(currentDay);

  useIsoLayoutEffect(() => {
    const container = containerRef.current;
    const track = trackRef.current;
    if (!container || !track) return;
    const firstChip = track.querySelector<HTMLElement>("[data-day]");
    if (!firstChip) return;
    const chipFullWidth = firstChip.offsetWidth + 6; // gap 1.5 = 6px
    const containerCenter = container.clientWidth / 2;
    const targetCenter = (currentDay - 0.5) * chipFullWidth;
    const offset = containerCenter - targetCenter;
    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    firedRef.current = false;
    if (prefersReduced) {
      setAnimate(false);
      setTargetX(offset);
      firedRef.current = true;
      onArriveRef.current?.();
      return;
    }
    setTargetX(0);
    setAnimate(false);
    const id = requestAnimationFrame(() => {
      setAnimate(true);
      setTargetX(offset);
    });
    // transitionend 가 안 뜨는 환경(웹뷰의 transition 무시·거의-0 거리·탭 백그라운드 등) 대비.
    // transitionend 와 둘 중 먼저 오는 1회만 firedRef 가드로 발화 → 컨페티 누락 방지.
    const fallback = setTimeout(
      () => {
        if (firedRef.current) return;
        firedRef.current = true;
        onArriveRef.current?.();
      },
      slideDurationMs(currentDay) + 200,
    );
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(fallback);
    };
  }, [currentDay, totalDays]);

  function handleTransitionEnd(e: React.TransitionEvent<HTMLDivElement>) {
    if (e.propertyName !== "transform" || firedRef.current) return;
    firedRef.current = true;
    onArriveRef.current?.();
  }

  return (
    <div ref={containerRef} className="bg-muted overflow-hidden rounded-[12px] px-2 py-3">
      <div
        ref={trackRef}
        onTransitionEnd={handleTransitionEnd}
        className="flex w-max items-center gap-1.5"
        style={{
          transform: `translate3d(${targetX}px, 0, 0)`,
          transition: animate ? `transform ${durationMs}ms var(--ease-out-soft)` : undefined,
        }}
      >
        {days.map((d) => {
          const tier = tiers.get(d) ?? 0;
          return (
            <span
              key={d}
              data-day={d}
              aria-label={chipLabel(d, tier, currentDay)}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums"
              style={chipStyle(tier, d, currentDay)}
            >
              {d}
            </span>
          );
        })}
      </div>
    </div>
  );
}

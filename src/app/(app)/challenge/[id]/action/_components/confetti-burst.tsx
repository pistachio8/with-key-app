"use client";

// 챌린지 성공(goal-reached) 시 상단 전 폭에서 흩날려 떨어지는 컨페티.
// canvas-confetti 를 동적 import — base 번들 미포함(web/performance). reduced-motion 이면 생략.

import { useEffect } from "react";

const BRAND_COLORS = ["#8AA4FF", "#FFD46B", "#BCA6FF", "#FFB6C6", "#52C28C"];
const DURATION_MS = 1300;

interface ConfettiBurstProps {
  /** false → true 로 바뀌는 순간 1회 발화(슬라이드 도착 시점). */
  fire: boolean;
}

export function ConfettiBurst({ fire }: ConfettiBurstProps) {
  useEffect(() => {
    if (!fire) return;
    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    void import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;
      const end = Date.now() + DURATION_MS;
      const tick = () => {
        if (cancelled || Date.now() > end) return;
        confetti({
          particleCount: 4,
          startVelocity: 0, // 위에서 시작 → gravity 로 낙하
          ticks: 220,
          gravity: 0.6,
          scalar: 1,
          colors: BRAND_COLORS,
          origin: { x: Math.random(), y: -0.05 }, // 상단 전 폭에 분산
        });
        timers.push(setTimeout(tick, 80));
      };
      tick();
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [fire]);

  return null;
}

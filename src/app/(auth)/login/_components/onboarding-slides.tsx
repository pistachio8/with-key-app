"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const ONBOARDED_KEY = "withkey:onboarded";

type Slide = {
  illust: string;
  illustTone: "primary" | "pink" | "secondary";
  title: string;
  body: string;
};

// 모킹업 §1-C / 1-D / 1-E / 1-F (line 432~487).
// illust 이모지·tone 은 모킹업 시각을 그대로 옮긴 것. body 카피는 plan PR3 §3.2 Step 1 매핑.
const SLIDES: Slide[] = [
  {
    illust: "🤖",
    illustTone: "primary",
    title: "AI 운동일기 자동 생성",
    body: "AI가 키워드를 일기로 바꿔줘요.\n글쓰기 부담 ZERO.",
  },
  {
    illust: "📷",
    illustTone: "pink",
    title: "운동 인증 기반 습관 형성",
    body: "사진 한 장과 키워드 몇 개로\n오늘의 운동을 짧게 남겨요.",
  },
  {
    illust: "💵",
    illustTone: "secondary",
    title: "인증 실패 시 벌금 누적",
    body: "하루 안에 인증 못 하면 벌금이\n자동으로 쌓여요. 강제력 ON.",
  },
  {
    illust: "👯",
    illustTone: "secondary",
    title: "친구들과 함께 챌린지",
    body: "단톡 채팅방에 링크 한 번이면 끝.\n4명까지 같은 약속을 시작해요.",
  },
];

const TONE_BG: Record<Slide["illustTone"], string> = {
  primary: "bg-[var(--brand-primary-soft)]",
  pink: "bg-[oklch(0.96_0.025_12)]",
  secondary: "bg-[var(--brand-secondary-soft)]",
};

export function OnboardingSlides() {
  const router = useRouter();
  const [idx, setIdx] = useState(0);

  // 이미 본 사용자는 즉시 /home 으로 — flicker 막기 위해 useEffect 안에서 redirect.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(ONBOARDED_KEY) === "1") {
      router.replace("/home");
    }
  }, [router]);

  const isLast = idx === SLIDES.length - 1;
  const slide = SLIDES[idx];

  function finish() {
    try {
      window.localStorage.setItem(ONBOARDED_KEY, "1");
    } catch {
      // localStorage 차단된 환경(시크릿 모드 일부)에서도 onboarding 종료는 진행.
    }
    router.replace("/home");
  }

  function next() {
    if (isLast) {
      finish();
      return;
    }
    setIdx((i) => i + 1);
  }

  return (
    <main className="bg-card mx-auto flex min-h-svh w-full max-w-screen-sm flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <ol aria-label="온보딩 진행 단계" className="flex items-center gap-1.5">
          {SLIDES.map((_, i) => {
            const active = i === idx;
            return (
              <li
                key={i}
                aria-current={active ? "step" : undefined}
                className={
                  active
                    ? "bg-primary h-1.5 w-4.5 rounded-full"
                    : "h-1.5 w-1.5 rounded-full bg-[oklch(0.86_0.005_264)]"
                }
              />
            );
          })}
        </ol>
        <button
          type="button"
          onClick={finish}
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          건너뛰기
        </button>
      </header>

      <section
        aria-labelledby="onboarding-title"
        className="flex flex-1 flex-col items-center justify-center gap-6 text-center"
      >
        <div
          aria-hidden="true"
          className={`grid size-32 place-items-center rounded-full text-5xl ${TONE_BG[slide.illustTone]}`}
        >
          {slide.illust}
        </div>
        <div>
          <h1 id="onboarding-title" className="t-h2">
            {slide.title}
          </h1>
          <p className="text-muted-foreground mt-2 whitespace-pre-line text-sm leading-relaxed">
            {slide.body}
          </p>
        </div>
      </section>

      <Button
        size="lg"
        onClick={next}
        // 모킹업 1~3 슬라이드 "다음" opacity:.6 (line 441·455·469) — 진행감 시각.
        // 마지막 "시작하기" 는 full color (plan §3.2 Step 5 F3).
        className={isLast ? "h-12 w-full" : "h-12 w-full opacity-60"}
      >
        {isLast ? "시작하기" : "다음"}
      </Button>
    </main>
  );
}

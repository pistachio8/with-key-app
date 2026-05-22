import { cn } from "@/lib/utils";

interface StampProps {
  label: string;
  tone?: "primary" | "success" | "danger";
  className?: string;
}

const TONE = {
  primary: "border-primary text-primary",
  success: "border-brand-success text-brand-success",
  danger: "border-destructive text-destructive",
} as const;

// mount 시 CSS 애니메이션 1회 실행. (이전: IntersectionObserver + threshold 0.4 —
// SSR/hydration 직후 IO fire 지연 또는 banner 가 다른 카드 아래로 밀려 threshold
// 미충족 시 도장이 영구 invisible 로 남아 좌측 빈 공간만 보이는 사례.)
// `animate-stamp-in` 키프레임: 0% opacity 0 + scale 1.8 → 100% opacity 1 + scale 1
// (animation-fill-mode: forwards — 최종 상태 유지).
export function Stamp({ label, tone = "primary", className }: StampProps) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "inline-flex size-20 items-center justify-center rounded-full border-[3px] font-bold tracking-wider",
        "animate-stamp-in",
        TONE[tone],
        className,
      )}
    >
      <span className="text-[13px] leading-tight text-center px-2">{label}</span>
    </div>
  );
}

import { cn } from "@/lib/utils";

interface StampProps {
  /** variant="label" 에선 도장 텍스트. variant="wordmark" 에선 aria-label 로만 쓰임(미지정 시 "from·with"). */
  label?: string;
  tone?: "primary" | "success" | "danger" | "onPrimary";
  /** "label": 단어 1개 · "wordmark": from·with 2줄 락업 + 이중 링 (모킹업 §3-C/§6-B 서약서 도장). */
  variant?: "label" | "wordmark";
  className?: string;
}

const TONE = {
  primary: "border-primary text-primary",
  success: "border-brand-success text-brand-success",
  danger: "border-destructive text-destructive",
  // primary 배경 카드 위에서 흰색 도장 (모킹업 .pledge.primary .stamp{border-color:#fff}).
  onPrimary: "border-primary-foreground text-primary-foreground",
} as const;

// mount 시 CSS 애니메이션 1회 실행. (이전: IntersectionObserver + threshold 0.4 —
// SSR/hydration 직후 IO fire 지연 또는 banner 가 다른 카드 아래로 밀려 threshold
// 미충족 시 도장이 영구 invisible 로 남아 좌측 빈 공간만 보이는 사례.)
// `animate-stamp-in` 키프레임: 0% opacity 0 + scale 1.8 → 100% opacity 1 + scale 1
// (animation-fill-mode: forwards — 최종 상태 유지).
export function Stamp({ label, tone = "primary", variant = "label", className }: StampProps) {
  return (
    <div
      role="img"
      aria-label={label ?? "from·with"}
      className={cn(
        "inline-flex size-20 items-center justify-center rounded-full border-[3px] font-bold tracking-wider",
        "animate-stamp-in",
        variant === "wordmark" && "relative flex-col",
        TONE[tone],
        className,
      )}
    >
      {variant === "wordmark" ? (
        <>
          {/* 모킹업 .stamp::before — 안쪽 보조 링 */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0.5 rounded-full border border-current opacity-45"
          />
          <span className="text-[8px] font-black uppercase leading-none tracking-[0.1em]">
            from
          </span>
          <span aria-hidden className="my-px h-0.5 w-6 rounded-full bg-current" />
          <span className="text-[11px] font-black uppercase leading-none tracking-[-0.01em]">
            with
          </span>
        </>
      ) : (
        <span className="text-[13px] leading-tight text-center px-2">{label}</span>
      )}
    </div>
  );
}

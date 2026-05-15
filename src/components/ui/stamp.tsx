"use client";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

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

export function Stamp({ label, tone = "primary", className }: StampProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [played, setPlayed] = useState(false);

  useEffect(() => {
    if (played) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setPlayed(true);
            observer.disconnect();
            return;
          }
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [played]);

  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      data-played={played}
      className={cn(
        "inline-flex size-20 items-center justify-center rounded-full border-[3px] font-bold tracking-wider",
        "opacity-0 scale-150 rotate-[-12deg]",
        "data-[played=true]:animate-stamp-in",
        TONE[tone],
        className,
      )}
    >
      <span className="text-[13px] leading-tight text-center px-2">{label}</span>
    </div>
  );
}

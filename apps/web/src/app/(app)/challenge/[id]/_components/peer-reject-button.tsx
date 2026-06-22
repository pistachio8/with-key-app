"use client";

// 🟨 익명 피어 반려(ADR-0038 / EVAL-0025). Kudos(응원)와 의미·경로가 다른 "판정 입력" —
// 누가 눌렀는지는 노출하지 않고 카운트만 보인다(익명). 1탭 토글, 과반이면 인증이 peer_rejected 된다.

import { cn } from "@/lib/utils";

interface PeerRejectButtonProps {
  count: number;
  // viewer 본인이 이미 반려했는지(read-your-writes 표시). 본인 신원 외 타인 반려는 카운트로만.
  active: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function PeerRejectButton({
  count,
  active,
  onToggle,
  disabled = false,
}: PeerRejectButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      aria-label={`이 인증 반려 (익명) ${count}명${active ? " · 내가 반려함" : ""}`}
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-transform duration-[var(--motion-fast)]",
        "active:scale-90 disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
        // 진행 중 반려=주황(경고 누적). active(본인 반려)면 채움 + bold.
        // 텍스트는 항상 text-foreground(어두움) — 밝은 주황/크림 위 흰 텍스트는 대비 AA 미달이라 어두운 텍스트로 통일.
        active
          ? "bg-brand-warn text-foreground font-bold"
          : "bg-brand-secondary-soft text-foreground",
      )}
    >
      <span aria-hidden="true" className="text-[13px] leading-none">
        🟨
      </span>
      <span>반려</span>
      <span className="tabular-nums">{count}</span>
    </button>
  );
}

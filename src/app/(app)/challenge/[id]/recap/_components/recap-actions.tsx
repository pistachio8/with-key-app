"use client";

// 모킹업 §11-A — "결과 공유" / "정산 요청".
// "정산 요청" 은 백로그 #38 — POC 는 disabled placeholder. 결과 공유는 Web Share API + 클립보드 폴백.

import { toast } from "sonner";
import { formatKRW } from "@/lib/challenge/penalty";

interface RecapActionsProps {
  title: string;
  totalPenalty: number;
}

async function shareResult(message: string): Promise<void> {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "with-key 결과", text: message });
      return;
    } catch {
      // 사용자 취소는 fallback 으로 넘어가지 않음.
      return;
    }
  }
  try {
    await navigator.clipboard.writeText(message);
    toast.success("결과 메시지를 복사했어요");
  } catch {
    toast.error("공유에 실패했어요. 다시 시도해 주세요.");
  }
}

export function RecapActions({ title, totalPenalty }: RecapActionsProps) {
  const message = `${title} 종료! 최종 벌금 ${formatKRW(totalPenalty)} · with-key`;

  return (
    <div className="mt-2 flex gap-2">
      <button
        type="button"
        onClick={() => void shareResult(message)}
        className="border-border/60 bg-card flex-1 rounded-full border py-3 text-[13px] font-semibold transition-transform active:scale-95"
      >
        결과 공유
      </button>
      <button
        type="button"
        disabled
        title="정산 기능은 다음 버전에서 제공돼요"
        className="bg-muted text-muted-foreground flex-1 cursor-not-allowed rounded-full py-3 text-[13px] font-semibold"
      >
        정산 요청
      </button>
    </div>
  );
}

"use client";

// 모킹업 §3-D — 챌린지 생성 완료 시트. invite URL 복사 + 카카오톡 공유.

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CreationCompleteSheetProps {
  inviteUrl: string;
}

export function CreationCompleteSheet({ inviteUrl }: CreationCompleteSheetProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("복사에 실패했어요");
    }
  }

  async function shareKakao() {
    if (navigator.share) {
      try {
        await navigator.share({ url: inviteUrl, title: "with-key 챌린지" });
        return;
      } catch {
        /* 사용자 취소 — fallthrough */
      }
    }
    await copy();
    toast.info("링크를 복사했어요. 카카오톡에 붙여넣어 공유하세요");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8">
      <div className="bg-brand-secondary-soft flex size-20 items-center justify-center rounded-full text-4xl">
        🎉
      </div>
      <h2 className="t-h2">챌린지가 생성되었어요!</h2>
      <p className="t-sub break-keep text-center">
        링크를 친구들에게 공유하면
        <br />
        서명한 멤버로 시작할 수 있어요
      </p>
      <div className="border-border/60 bg-muted/40 mt-2 flex w-full items-center justify-between gap-2 rounded-[12px] border px-3 py-2.5">
        <span className="t-sub flex-1 truncate font-mono text-[12px]">{inviteUrl}</span>
        <button
          type="button"
          onClick={copy}
          className={cn(
            "t-sub text-primary rounded px-2 py-1 font-semibold transition-transform",
            "focus-visible:ring-ring active:scale-95 focus-visible:outline-none focus-visible:ring-2",
          )}
        >
          {copied ? "복사됨" : "copy"}
        </button>
      </div>
      <button
        type="button"
        onClick={shareKakao}
        className={cn(
          "w-full rounded-full py-3 text-[13px] font-semibold transition-transform",
          "focus-visible:ring-ring active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        )}
        style={{ backgroundColor: "#FEE500", color: "#3C2E22" }}
      >
        카카오톡으로 공유
      </button>
      {/* mockup §3-D — 공유 후 홈으로 유도 (챌린지 상세는 home 의 챌린지 카드로 진입). */}
      <Link href="/home" className="t-sub mt-2 underline-offset-4 hover:underline">
        홈으로
      </Link>
    </div>
  );
}

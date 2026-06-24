"use client";

// 벌칙 증명 동료 판단 토글 (spec §C4 / EVAL-0044, mockup penalty-review.html).
// peer-reject-button.tsx 미러 — 응원이 아니라 "판정" 입력. 기본값=인정, 반려 토글 1탭, 과반이면 status=rejected.
// 익명: 누가 눌렀는지 노출하지 않고 카운트만 보인다(viewerRejected 는 본인 read-your-writes 표시).

import { Check, Loader2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { makeUserMessage } from "@/lib/actions/error-messages";
import { cn } from "@/lib/utils";
import { togglePenaltyProofRejection } from "../_actions";

const userMessage = makeUserMessage({
  forbidden: "지금은 판정할 수 있는 기간이 아니에요.",
});

interface Props {
  proofId: string;
  rejectCount: number;
  viewerRejected: boolean;
  disabled?: boolean;
}

export function PenaltyJudgeButtons({
  proofId,
  rejectCount,
  viewerRejected,
  disabled = false,
}: Props) {
  const router = useRouter();
  const [rejected, setRejected] = useState(viewerRejected);
  const [count, setCount] = useState(rejectCount);
  const [pending, startTransition] = useTransition();

  // accepted(기본) = 반려 아님. reject 토글로 두 상태를 오간다.
  function setVerdict(nextRejected: boolean) {
    if (nextRejected === rejected || pending) return;
    startTransition(async () => {
      const res = await togglePenaltyProofRejection({ proofId });
      if (!res.ok) {
        toast.error(userMessage(res.error));
        if (res.error === "unauthorized") router.push("/login");
        return;
      }
      setRejected(res.data.viewerRejected);
      setCount(res.data.rejectCount);
      toast(res.data.viewerRejected ? "반려로 판정했어요 · 익명" : "인정으로 판정했어요 · 익명");
      router.refresh();
    });
  }

  const busy = pending || disabled;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="내 판정">
        <button
          type="button"
          disabled={busy}
          aria-pressed={!rejected}
          onClick={() => setVerdict(false)}
          className={cn(
            "flex flex-col items-center gap-1.5 rounded-2xl border p-4 transition-colors",
            "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
            "disabled:pointer-events-none disabled:opacity-60",
            !rejected
              ? "border-brand-success bg-brand-success/10"
              : "bg-card text-muted-foreground border-border",
          )}
        >
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-full",
              !rejected ? "bg-brand-success text-white" : "bg-muted text-muted-foreground",
            )}
            aria-hidden="true"
          >
            <Check className="size-4" />
          </span>
          <span className="text-[13px] font-bold">인정</span>
          <span className="text-muted-foreground text-[11px]">미션 통과</span>
        </button>
        <button
          type="button"
          disabled={busy}
          aria-pressed={rejected}
          onClick={() => setVerdict(true)}
          className={cn(
            "flex flex-col items-center gap-1.5 rounded-2xl border p-4 transition-colors",
            "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
            "disabled:pointer-events-none disabled:opacity-60",
            rejected
              ? "border-brand-warn bg-brand-secondary-soft"
              : "bg-card text-muted-foreground border-border",
          )}
        >
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-full",
              rejected ? "bg-brand-warn text-foreground" : "bg-muted text-muted-foreground",
            )}
            aria-hidden="true"
          >
            <X className="size-4" />
          </span>
          <span className="text-[13px] font-bold">반려</span>
          <span className="text-muted-foreground text-[11px]">불성실</span>
        </button>
      </div>
      <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-[11px]">
        {busy && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
        <span className="tabular-nums">현재 반려 {count}명</span>
        <span aria-hidden="true">·</span>
        <span>누가 눌렀는지는 공개되지 않아요</span>
      </p>
    </div>
  );
}

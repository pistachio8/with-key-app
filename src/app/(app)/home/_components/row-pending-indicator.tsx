"use client";

// 홈 진행 중 챌린지 row 의 D-N / spinner 자리.
// <Link> 자식 트리 안에서만 useLinkStatus 가 의미 — 부모 Link 가 pending 일 때 spinner.

import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";

type Status = "pending" | "accepted" | "active" | "closed";

interface Props {
  daysLeft: number;
  joinedLate: boolean;
  status: Status;
}

export function RowPendingIndicator({ daysLeft, joinedLate, status }: Props) {
  const { pending } = useLinkStatus();
  if (pending) {
    return (
      <span
        aria-label="진입 중"
        className="text-muted-foreground inline-flex size-5 shrink-0 items-center justify-center"
      >
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="t-caption shrink-0 tabular-nums">
      {joinedLate ? "다음부터" : status === "active" ? `D-${daysLeft}` : "대기"}
    </span>
  );
}

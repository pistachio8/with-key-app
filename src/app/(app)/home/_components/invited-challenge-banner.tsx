// 모킹업 §2-B `.invite-banner` — 초대받은(서명 대기) 챌린지 배너.
// 사용자가 참여자이면서 아직 서명 안 한 pending 챌린지가 1+일 때만 노출.

import Link from "next/link";
import { Mail, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type InvitedChallenge = {
  challengeId: string;
  title: string;
  groupName: string | null;
};

type Props = {
  invites: ReadonlyArray<InvitedChallenge>;
};

export function InvitedChallengeBanner({ invites }: Props) {
  if (invites.length === 0) return null;
  const first = invites[0]!;
  const targetHref = `/challenge/${first.challengeId}/pledge`;
  const subtitle = first.groupName ? `${first.groupName} · ${first.title}` : first.title;

  return (
    <Link
      href={targetHref}
      className={cn(
        "bg-brand-primary-soft flex items-center gap-3 rounded-2xl border border-transparent p-3",
        "hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span
        aria-hidden="true"
        className="bg-card text-primary flex size-9 shrink-0 items-center justify-center rounded-xl"
      >
        <Mail className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="t-body flex items-center gap-1.5 font-semibold">
          초대받은 챌린지
          <span
            aria-label={`${invites.length}건`}
            className="bg-primary text-primary-foreground inline-flex size-[18px] items-center justify-center rounded-full text-[10px] font-bold tabular-nums"
          >
            {invites.length}
          </span>
        </p>
        <p className="t-sub truncate">{subtitle}</p>
      </div>
      <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
    </Link>
  );
}

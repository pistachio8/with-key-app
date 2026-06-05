// 마이페이지 → 챌린지 관리 진입 카드.

import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";

interface MyChallengesCardProps {
  ownerCount: number;
  memberCount: number;
}

export function MyChallengesCard({ ownerCount, memberCount }: MyChallengesCardProps) {
  return (
    <Link
      href="/me/challenges"
      className="focus-visible:ring-ring block rounded-[14px] transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      <Card padding="lg" className="flex items-center gap-4">
        <div className="bg-brand-secondary-soft flex size-10 items-center justify-center rounded-full">
          <Trophy className="size-5" aria-hidden="true" />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <div className="t-h3">내 챌린지 관리</div>
          <div className="t-sub">
            운영 중 <span className="text-foreground font-semibold tabular-nums">{ownerCount}</span>{" "}
            · 참여 중{" "}
            <span className="text-foreground font-semibold tabular-nums">{memberCount}</span>
          </div>
        </div>
        <ChevronRight className="text-muted-foreground size-5" aria-hidden="true" />
      </Card>
    </Link>
  );
}

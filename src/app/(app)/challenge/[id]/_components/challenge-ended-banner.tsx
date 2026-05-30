// F17 lazy 종료 표시 — endAt 지난 active(phase='over') 챌린지 진입 시 recap 진입 배너.
// 서버 status 갱신은 deadline-push cron 의 auto-close(ADR-0027) 가 담당. 본 컴포넌트는 시각만.

import Link from "next/link";
import { Trophy, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";

interface ChallengeEndedBannerProps {
  challengeId: string;
}

export function ChallengeEndedBanner({ challengeId }: ChallengeEndedBannerProps) {
  return (
    <Link
      href={`/challenge/${challengeId}/recap`}
      className="focus-visible:ring-ring block rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      <Card
        tone="muted"
        padding="lg"
        className="flex items-center gap-3 transition-transform active:scale-[0.99]"
      >
        <div className="bg-brand-secondary-soft flex size-10 items-center justify-center rounded-full">
          <Trophy className="size-5" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <div className="t-body font-semibold">챌린지가 종료되었어요</div>
          <div className="t-sub">결과 보기 →</div>
        </div>
        <ChevronRight className="text-muted-foreground size-5" aria-hidden="true" />
      </Card>
    </Link>
  );
}

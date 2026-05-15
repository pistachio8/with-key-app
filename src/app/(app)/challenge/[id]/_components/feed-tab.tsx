// 모킹업 §8-A 피드 탭 — 오늘 배너 + 인증 피드 리스트.
// "운동 시작" 트리거는 FAB(카메라)로 통합 — 명시 버튼 제거 (mockup compliance).
// 비참여·미서명 등 상태에서는 NextStepCta 노출.

import { ChallengeFeed } from "./challenge-feed";
import { NextStepCta } from "./next-step-cta";
import { TodayBanner } from "./today-banner";
import type { FeedItemView } from "@/lib/db/reads/challenge-feed";

interface FeedTabProps {
  viewerId: string;
  feed: ReadonlyArray<FeedItemView>;
  participantCount: number;
  todayDoneCount: number;
  todayMissingNames: ReadonlyArray<string>;
  status: "pending" | "accepted" | "active" | "closed";
  isParticipant: boolean;
  mySigned: boolean;
}

export function FeedTab({
  viewerId,
  feed,
  participantCount,
  todayDoneCount,
  todayMissingNames,
  status,
  isParticipant,
  mySigned,
}: FeedTabProps) {
  const isSolo = participantCount === 1;
  const showNextStep = !(isParticipant && status === "active");
  return (
    <div className="flex flex-col gap-3">
      {status === "active" && (
        <TodayBanner
          todayDoneCount={todayDoneCount}
          participantCount={participantCount}
          todayMissingNames={todayMissingNames}
        />
      )}
      {showNextStep && (
        <section aria-label="다음 액션">
          <NextStepCta
            status={status}
            isParticipant={isParticipant}
            mySigned={mySigned}
            isSolo={isSolo}
          />
        </section>
      )}
      <section aria-labelledby="feed-heading">
        <h2 id="feed-heading" className="t-h3 mb-2">
          최근 인증
        </h2>
        <ChallengeFeed items={feed} viewerId={viewerId} participantCount={participantCount} />
      </section>
    </div>
  );
}

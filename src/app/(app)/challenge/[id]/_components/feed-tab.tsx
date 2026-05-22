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
  // 종료(status='closed') 또는 만기 도달(status='active' && end_at < now) 시 true.
  // 자식 KudosBar 의 disabled 와 FeedCard 의 편집 링크 hide 에 전파.
  isEnded: boolean;
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
  isEnded,
}: FeedTabProps) {
  const isSolo = participantCount === 1;
  const showNextStep = !(isParticipant && status === "active");
  // 시작 전(pending/accepted) 에는 인증 로그가 존재할 수 없으므로 피드 섹션 자체를 숨김.
  // "첫 번째 인증을 올려보세요" 폴백이 시작 전엔 거짓 안내가 된다. NextStepCta 가 안내 역할.
  const showFeedSection = status === "active" || status === "closed";
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
      {showFeedSection && (
        <section aria-labelledby="feed-heading">
          <h2 id="feed-heading" className="t-h3 mb-2">
            최근 인증
          </h2>
          <ChallengeFeed
            items={feed}
            viewerId={viewerId}
            participantCount={participantCount}
            isEnded={isEnded}
          />
        </section>
      )}
    </div>
  );
}

// 모킹업 §8-A 피드 탭 — 오늘 배너 + 인증 피드 리스트.
// "운동 시작" 트리거는 FAB(카메라)로 통합 — 명시 버튼 제거 (mockup compliance).
// 비참여·미서명 등 상태에서는 NextStepCta 노출.

import { ChallengeFeed } from "./challenge-feed";
import { NextStepCta } from "./next-step-cta";
import { TodayBanner } from "./today-banner";
import { formatFeedTimestamp } from "@/lib/challenge/feed-time";
import type { ChallengePhase } from "@/lib/challenge/lifecycle";
import type { FeedItemView } from "@/lib/db/reads/challenge-feed";

interface FeedTabProps {
  viewerId: string;
  feed: ReadonlyArray<FeedItemView>;
  participantCount: number;
  todayDoneCount: number;
  todayMissingNames: ReadonlyArray<string>;
  // ADR-0027 — status 가 아니라 phase. over(만기)는 closed 처럼 종료 취급(오늘 배너·인증 유도 숨김).
  phase: ChallengePhase;
  isParticipant: boolean;
  mySigned: boolean;
  // over(phase) 또는 closed 시 true. 자식 KudosBar 의 disabled 와 FeedCard 편집 링크 hide 에 전파.
  isEnded: boolean;
}

export function FeedTab({
  viewerId,
  feed,
  participantCount,
  todayDoneCount,
  todayMissingNames,
  phase,
  isParticipant,
  mySigned,
  isEnded,
}: FeedTabProps) {
  const isSolo = participantCount === 1;
  const showNextStep = !(isParticipant && phase === "running");
  // 시작 전(pending/accepted) 에는 인증 로그가 존재할 수 없으므로 피드 섹션 자체를 숨김.
  // "첫 번째 인증을 올려보세요" 폴백이 시작 전엔 거짓 안내가 된다. NextStepCta 가 안내 역할.
  const showFeedSection = phase === "running" || phase === "over" || phase === "closed";
  // 상대 시간 label 은 시점 의존이라 cache(read)에 넣지 않고 RSC render 의 now 로 계산한다.
  // server 에서 한 번 계산해 string 으로 내려보내므로 client hydration 불일치가 없다.
  const now = new Date();
  const feedItems = feed.map((item) => ({
    ...item,
    createdAtLabel: formatFeedTimestamp(item.createdAt, now),
  }));
  return (
    <div className="flex flex-col gap-3">
      {phase === "running" && (
        <TodayBanner
          todayDoneCount={todayDoneCount}
          participantCount={participantCount}
          todayMissingNames={todayMissingNames}
        />
      )}
      {showNextStep && (
        <section aria-label="다음 액션">
          <NextStepCta
            phase={phase}
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
            items={feedItems}
            viewerId={viewerId}
            participantCount={participantCount}
            isEnded={isEnded}
          />
        </section>
      )}
    </div>
  );
}

"use client";

import { useCallback, useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { FeedCard } from "./feed-card";
import { toggleKudos, togglePeerRejection } from "../_actions";
import { makeUserMessage, FALLBACK_ERROR_MESSAGE } from "@/lib/actions/error-messages";
import type { FeedItemView } from "@/lib/db/reads/challenge-feed";
import type { KudosEmoji } from "@withkey/domain";

// FeedTab(RSC) 가 createdAt → 상대 시간/일자 label 을 render 시점에 계산해 주입한다.
// 상대 시간은 시점 의존이라 cache 에 저장하지 않고 immutable createdAt 만 캐시 → 여기로 전달.
export type FeedItemWithLabel = FeedItemView & { createdAtLabel: string };

type Props = {
  items: ReadonlyArray<FeedItemWithLabel>;
  viewerId: string;
  // 솔로(1)면 자식 FeedCard 가 Kudos footer 미렌더.
  participantCount: number;
  // 종료(closed) 또는 만기 도달(active + past end_at) 시 kudos 토글·편집 차단.
  isEnded: boolean;
};

type OptimisticAction =
  | { kind: "kudos"; logId: string; emoji: KudosEmoji }
  | { kind: "peerReject"; logId: string };

const messageFor = makeUserMessage({
  forbidden: "자기 인증에는 응원을 보낼 수 없어요.",
});

// 🟨 반려 실패 메시지(ADR-0038). 자기 반려는 UI 에서 미렌더라 도달하지 않고, 남는 forbidden 은
// 주로 "정산 전 48h 창 종료" 또는 "서약 참가자 아님". not_found 는 삭제된 인증.
const peerRejectMessageFor = makeUserMessage({
  forbidden: "지금은 이 인증을 반려할 수 없어요.",
  not_found: "인증을 찾을 수 없어요.",
});

function applyToggle(
  items: ReadonlyArray<FeedItemWithLabel>,
  action: OptimisticAction,
): FeedItemWithLabel[] {
  return items.map((item) => {
    if (item.id !== action.logId) return item;

    if (action.kind === "peerReject") {
      const wasRejected = item.viewerRejected;
      return {
        ...item,
        viewerRejected: !wasRejected,
        peerRejectCount: Math.max(0, item.peerRejectCount + (wasRejected ? -1 : 1)),
      };
    }

    const hadKudos = item.viewerKudos.includes(action.emoji);
    const viewerKudos = hadKudos
      ? item.viewerKudos.filter((emoji) => emoji !== action.emoji)
      : [...item.viewerKudos, action.emoji];
    const kudosByEmoji = { ...item.kudosByEmoji };
    kudosByEmoji[action.emoji] = Math.max(
      0,
      (kudosByEmoji[action.emoji] ?? 0) + (hadKudos ? -1 : 1),
    );

    return { ...item, viewerKudos, kudosByEmoji };
  });
}

// Phase 3 (SNS cache plan v4) — settledItems React local state 제거.
// useOptimistic 의 base 를 items props 직접 사용해 transition 종료 시 server-rendered
// fresh 값으로 자동 sync. toggleKudos 의 updateTag 가 즉시 본인 cache invalidation 을
// 보장하므로 server-rendered props 가 fresh — 1→0→1 flicker 차단.
export function ChallengeFeed({ items, viewerId, participantCount, isEnded }: Props) {
  const [optimisticItems, applyOptimistic] = useOptimistic(items, applyToggle);
  const [, startTransition] = useTransition();

  const handleKudos = useCallback(
    (logId: string, authorId: string, emoji: KudosEmoji) => {
      if (authorId === viewerId) return;
      // 종료된 챌린지는 클라이언트에서도 조기 차단 (UI disabled 우회 방어).
      if (isEnded) return;

      startTransition(async () => {
        applyOptimistic({ kind: "kudos", logId, emoji });

        try {
          const result = await toggleKudos({ actionLogId: logId, emoji });
          if (!result.ok) {
            toast.error(messageFor(result.error));
            return;
          }
          // 별도 settledItems 동기화 불필요 — server response 가 updateTag 로 fresh.
        } catch (error) {
          console.error("[ChallengeFeed] toggleKudos failed", error);
          toast.error(FALLBACK_ERROR_MESSAGE);
        }
      });
    },
    [applyOptimistic, viewerId, isEnded],
  );

  // 🟨 익명 피어 반려 토글(ADR-0038). 본인 인증은 반려 불가(early return). kudos 와 달리 isEnded
  // 로 막지 않는다 — 종료 후에도 48h 내 토글 가능(RPC 가 시간창·자격·과반을 한 트랜잭션으로 강제).
  const handlePeerReject = useCallback(
    (logId: string, authorId: string) => {
      if (authorId === viewerId) return;

      startTransition(async () => {
        applyOptimistic({ kind: "peerReject", logId });

        try {
          const result = await togglePeerRejection({ actionLogId: logId });
          if (!result.ok) {
            toast.error(peerRejectMessageFor(result.error));
            return;
          }
        } catch (error) {
          console.error("[ChallengeFeed] togglePeerRejection failed", error);
          toast.error(FALLBACK_ERROR_MESSAGE);
        }
      });
    },
    [applyOptimistic, viewerId],
  );

  if (optimisticItems.length === 0) {
    return (
      <p className="text-muted-foreground text-sm break-keep">
        아직 인증이 없어요. 첫 번째 인증을 올려보세요.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {optimisticItems.map((item) => (
        <li key={item.id}>
          <FeedCard
            authorName={item.authorName}
            photoSignedUrl={item.photoSignedUrl}
            summary={item.summary}
            keywords={item.keywords}
            kudosByEmoji={item.kudosByEmoji}
            viewerKudos={item.viewerKudos}
            onKudos={(emoji) => handleKudos(item.id, item.authorId, emoji)}
            peerRejectCount={item.peerRejectCount}
            viewerRejected={item.viewerRejected}
            onPeerReject={() => handlePeerReject(item.id, item.authorId)}
            disabled={item.authorId === viewerId || isEnded}
            participantCount={participantCount}
            isSelfAuthor={item.authorId === viewerId}
            createdAtLabel={item.createdAtLabel}
            isEnded={isEnded}
            isPeerRejected={item.isPeerRejected}
          />
        </li>
      ))}
    </ul>
  );
}

"use client";

import { useCallback, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { FeedCard } from "./feed-card";
import { toggleKudos } from "../_actions";
import { makeUserMessage, FALLBACK_ERROR_MESSAGE } from "@/lib/actions/error-messages";
import type { FeedItemView } from "@/lib/db/reads/challenge-feed";
import type { KudosEmoji } from "@/lib/validators/kudos";

type Props = {
  items: ReadonlyArray<FeedItemView>;
  viewerId: string;
  // 솔로(1)면 자식 FeedCard 가 Kudos footer 미렌더.
  participantCount: number;
  // 종료(closed) 또는 만기 도달(active + past end_at) 시 kudos 토글·편집 차단.
  isEnded: boolean;
};

type OptimisticAction = {
  logId: string;
  emoji: KudosEmoji;
};

const messageFor = makeUserMessage({
  forbidden: "자기 인증에는 응원을 보낼 수 없어요.",
});

function applyToggle(items: ReadonlyArray<FeedItemView>, action: OptimisticAction): FeedItemView[] {
  return items.map((item) => {
    if (item.id !== action.logId) return item;

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

export function ChallengeFeed({ items, viewerId, participantCount, isEnded }: Props) {
  const [settledItems, setSettledItems] = useState<FeedItemView[]>(() => [...items]);
  const [optimisticItems, applyOptimistic] = useOptimistic(settledItems, applyToggle);
  const [, startTransition] = useTransition();

  const handleKudos = useCallback(
    (logId: string, authorId: string, emoji: KudosEmoji) => {
      if (authorId === viewerId) return;
      // 종료된 챌린지는 클라이언트에서도 조기 차단 (UI disabled 우회 방어).
      if (isEnded) return;

      startTransition(async () => {
        const action = { logId, emoji };
        applyOptimistic(action);

        try {
          const result = await toggleKudos({ actionLogId: logId, emoji });
          if (!result.ok) {
            toast.error(messageFor(result.error));
            return;
          }
          setSettledItems((currentItems) => applyToggle(currentItems, action));
        } catch (error) {
          console.error("[ChallengeFeed] toggleKudos failed", error);
          toast.error(FALLBACK_ERROR_MESSAGE);
        }
      });
    },
    [applyOptimistic, viewerId, isEnded],
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
            disabled={item.authorId === viewerId || isEnded}
            participantCount={participantCount}
            isSelfAuthor={item.authorId === viewerId}
            isEnded={isEnded}
          />
        </li>
      ))}
    </ul>
  );
}

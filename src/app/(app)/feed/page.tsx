import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchActiveChallenge } from "@/lib/db/reads/active-challenge";
import { fetchChallengeFeed } from "@/lib/db/reads/challenge-feed";
import { fetchUnreadKudosCount } from "@/lib/db/reads/unread-kudos";
import { createClient } from "@/lib/supabase/server";
import { ChallengeFeed } from "../challenge/[id]/_components/challenge-feed";
import { UnreadBadge } from "./_components/unread-badge";
import { markFeedSeen } from "./_actions";

// PRD §7 · Design Brief 화면 6 (피드) · §1.5 미읽음 Kudos 배지.
export default async function FeedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 순서 중요: count 를 먼저 집계 → 이후 seen 마킹. 역순이면 배지가 절대 안 뜸.
  const unreadCount = await fetchUnreadKudosCount(user.id);
  void markFeedSeen();

  const active = await fetchActiveChallenge(user.id, { statuses: ["active"] });

  if (!active) {
    return (
      <div className="flex flex-col gap-6 p-4">
        <header className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">피드</h1>
          <UnreadBadge count={unreadCount} />
        </header>
        <p className="text-muted-foreground break-keep text-sm">
          현재 진행 중인 챌린지가 없어요. 챌린지가 시작되면 인증 피드가 여기에 모입니다.
        </p>
        <Link
          href="/home"
          className="text-primary w-fit text-sm font-semibold underline-offset-4 hover:underline"
        >
          홈으로 가기
        </Link>
      </div>
    );
  }

  const feed = await fetchChallengeFeed(active.id, user.id);

  return (
    <div className="flex flex-col gap-6 p-4">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium">현재 챌린지</p>
          <h1 className="text-xl font-semibold">인증 피드</h1>
          <p className="text-muted-foreground truncate text-sm">{active.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <UnreadBadge count={unreadCount} />
          <Link
            href={`/challenge/${active.id}`}
            className="text-primary text-sm font-semibold underline-offset-4 hover:underline"
          >
            현황
          </Link>
        </div>
      </header>

      <section aria-labelledby="feed-heading">
        <h2 id="feed-heading" className="sr-only">
          인증 피드 목록
        </h2>
        <ChallengeFeed items={feed} viewerId={user.id} />
      </section>
    </div>
  );
}

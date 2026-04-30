import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchActiveChallenge } from "@/lib/db/reads/active-challenge";
import { fetchChallengeFeed } from "@/lib/db/reads/challenge-feed";
import { createClient } from "@/lib/supabase/server";
import { ChallengeFeed } from "../challenge/[id]/_components/challenge-feed";

// PRD §7 · Design Brief 화면 6 (피드)
export default async function FeedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const active = await fetchActiveChallenge(user.id, { statuses: ["active"] });

  if (!active) {
    return (
      <div className="flex flex-col gap-6 p-4">
        <h1 className="text-xl font-semibold">피드</h1>
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
        <Link
          href={`/challenge/${active.id}`}
          className="text-primary shrink-0 text-sm font-semibold underline-offset-4 hover:underline"
        >
          현황
        </Link>
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

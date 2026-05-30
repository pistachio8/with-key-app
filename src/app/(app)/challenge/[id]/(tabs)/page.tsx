import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { challengePhase, isChallengeOver } from "@/lib/challenge/lifecycle";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { fetchChallengeFeed } from "@/lib/db/reads/challenge-feed";
import { getAuthedUser } from "@/lib/supabase/auth";
import { FeedTab } from "../_components/feed-tab";
import FeedLoading from "./loading";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  tab?: string;
  just_joined?: string;
  activated?: string;
  joined_late?: string;
}>;

function isSameLocalDay(iso: string, now = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// Next.js 16 cacheComponents: 셸은 sync — props 만 자식으로 전달.
// searchParams 기반 ?tab=·?just_joined redirect 와 fetch 모두 FeedSection 자식에서 평가.
export default function ChallengeFeedPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<FeedLoading />}>
      <FeedSection params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function FeedSection({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;

  // tab 제외 query 보존하며 새 segment 로 redirect.
  const preserved = new URLSearchParams();
  if (sp.just_joined === "1") preserved.set("just_joined", "1");
  if (sp.activated === "1") preserved.set("activated", "1");
  if (sp.joined_late === "1") preserved.set("joined_late", "1");
  const preservedQuery = preserved.toString() ? `?${preserved.toString()}` : "";

  if (sp.tab === "dashboard") redirect(`/challenge/${id}/dashboard${preservedQuery}`);
  if (sp.tab === "info") redirect(`/challenge/${id}/info${preservedQuery}`);
  // 초대 직후 진입은 info 탭에서 시작 — 기존 동작 보존.
  if (sp.tab === undefined && sp.just_joined === "1") {
    redirect(`/challenge/${id}/info${preservedQuery}`);
  }

  const { user } = await getAuthedUser();
  if (!user) redirect("/login");

  const detail = await fetchChallengeDetail(id);
  if (!detail) notFound();

  const me = detail.members.find((m) => m.id === user.id);
  const isParticipant = me != null;
  const mySigned = me?.signed ?? false;
  // ADR-0027 — layout.tsx 와 동일 SoT(challengePhase/isChallengeOver). over/closed → kudos 잠금.
  const phase = challengePhase(detail.status, detail.endAt);
  const isEnded = isChallengeOver(detail.status, detail.endAt);

  const feed = await fetchChallengeFeed(id, user.id);
  const todayAuthorIds = new Set(
    feed.filter((f) => isSameLocalDay(f.createdAt)).map((f) => f.authorId),
  );
  const todayDoneCount = todayAuthorIds.size;
  const todayMissingNames = detail.members
    .filter((m) => !todayAuthorIds.has(m.id))
    .map((m) => (m.id === user.id ? "나" : m.displayName));

  return (
    <>
      <FeedTab
        viewerId={user.id}
        feed={feed}
        participantCount={detail.participantCount}
        todayDoneCount={todayDoneCount}
        todayMissingNames={todayMissingNames}
        phase={phase}
        isParticipant={isParticipant}
        mySigned={mySigned}
        isEnded={isEnded}
      />
    </>
  );
}

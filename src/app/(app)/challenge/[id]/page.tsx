import { notFound, redirect } from "next/navigation";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { fetchChallengeFeed } from "@/lib/db/reads/challenge-feed";
import { getAuthedUser } from "@/lib/supabase/auth";
import { ActionFab } from "./_components/action-fab";
import { FeedTab } from "./_components/feed-tab";

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

// Next.js 16: layout 은 searchParams 를 받지 못하므로 ?tab=·?just_joined 호환
// redirect 와 root feed segment 의 query 처리는 본 page 에서 담당한다.
export default async function ChallengeFeedPage({
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

  const feed = await fetchChallengeFeed(id, user.id);
  const todayAuthorIds = new Set(
    feed.filter((f) => isSameLocalDay(f.createdAt)).map((f) => f.authorId),
  );
  const todayDoneCount = todayAuthorIds.size;
  const todayMissingNames = detail.members
    .filter((m) => !todayAuthorIds.has(m.id))
    .map((m) => (m.id === user.id ? "나" : m.displayName));

  const actionHref =
    isParticipant && detail.status === "active" ? `/challenge/${id}/action` : undefined;

  return (
    <>
      <FeedTab
        viewerId={user.id}
        feed={feed}
        participantCount={detail.participantCount}
        todayDoneCount={todayDoneCount}
        todayMissingNames={todayMissingNames}
        status={detail.status}
        isParticipant={isParticipant}
        mySigned={mySigned}
      />
      <ActionFab href={actionHref} />
    </>
  );
}

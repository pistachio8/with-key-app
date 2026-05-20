import { notFound, redirect } from "next/navigation";
import { Camera } from "lucide-react";
import { Fab } from "@/components/ui/fab";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { fetchChallengeFeed } from "@/lib/db/reads/challenge-feed";
import { getAuthedUser } from "@/lib/supabase/auth";
import { FeedTab } from "./_components/feed-tab";

type Params = Promise<{ id: string }>;

function isSameLocalDay(iso: string, now = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default async function ChallengeFeedPage({ params }: { params: Params }) {
  const { id } = await params;
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
      {actionHref && (
        <Fab
          href={actionHref}
          label="인증하기"
          icon={Camera}
          className="fixed bottom-6 left-1/2 z-20 -translate-x-1/2"
        />
      )}
    </>
  );
}

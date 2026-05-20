import { notFound, redirect } from "next/navigation";
import { Camera } from "lucide-react";
import { Fab } from "@/components/ui/fab";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { fetchChallengeFeed } from "@/lib/db/reads/challenge-feed";
import { getAuthedUser } from "@/lib/supabase/auth";
import { DashboardTab } from "../_components/dashboard-tab";

type Params = Promise<{ id: string }>;

function computeDaysLeft(endAtIso: string | null): number | null {
  if (!endAtIso) return null;
  return Math.max(0, Math.ceil((new Date(endAtIso).getTime() - Date.now()) / 86_400_000));
}

export default async function ChallengeDashboardPage({ params }: { params: Params }) {
  const { id } = await params;
  const { user } = await getAuthedUser();
  if (!user) redirect("/login");

  const detail = await fetchChallengeDetail(id);
  if (!detail) notFound();

  const me = detail.members.find((m) => m.id === user.id);
  const isParticipant = me != null;

  const feed = await fetchChallengeFeed(id, user.id);
  const totalFailures = 0; // PRD §35 결정 전 placeholder — 기존 page.tsx 와 동일.
  const totalPenalty = totalFailures * detail.penaltyAmount;
  const daysLeft = computeDaysLeft(detail.endAt);

  const actionHref =
    isParticipant && detail.status === "active" ? `/challenge/${id}/action` : undefined;

  return (
    <>
      <DashboardTab
        totalPenalty={totalPenalty}
        totalActions={feed.length}
        totalFailures={totalFailures}
        daysRemaining={daysLeft}
        members={detail.members}
        goalCount={detail.goalCount}
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

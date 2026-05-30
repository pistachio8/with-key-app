import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { challengePhase, remainingDays } from "@/lib/challenge/lifecycle";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { fetchChallengeFeed } from "@/lib/db/reads/challenge-feed";
import { getAuthedUser } from "@/lib/supabase/auth";
import { DashboardTab } from "../../_components/dashboard-tab";
import DashboardLoading from "./loading";

type Params = Promise<{ id: string }>;

// Next.js 16 cacheComponents: 셸은 sync, dynamic await 는 DashboardSection 자식에서.
export default function ChallengeDashboardPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardSection params={params} />
    </Suspense>
  );
}

async function DashboardSection({ params }: { params: Params }) {
  const { id } = await params;
  const { user } = await getAuthedUser();
  if (!user) redirect("/login");

  const detail = await fetchChallengeDetail(id);
  if (!detail) notFound();

  const feed = await fetchChallengeFeed(id, user.id);
  const totalFailures = 0; // PRD §35 결정 전 placeholder — 기존 page.tsx 와 동일.
  const totalPenalty = totalFailures * detail.penaltyAmount;
  // ADR-0027 — phase 로 일원화. running 만 "남은 N일", over/closed 는 "종료".
  const phase = challengePhase(detail.status, detail.endAt);
  const daysLeft = detail.endAt ? remainingDays(detail.endAt) : null;

  return (
    <>
      <DashboardTab
        totalPenalty={totalPenalty}
        totalActions={feed.length}
        totalFailures={totalFailures}
        daysRemaining={daysLeft}
        phase={phase}
        members={detail.members}
        goalCount={detail.goalCount}
      />
    </>
  );
}

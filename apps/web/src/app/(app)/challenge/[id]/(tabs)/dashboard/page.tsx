import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import {
  challengePhase,
  remainingDays,
  toKstDayKey,
  dayIndexOf,
  buildWeekChips,
  currentWeekStatus,
  type CutoffContext,
  type CutoffPhase,
} from "@withkey/domain";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
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

// export 는 EVAL-0039 배선 회귀 테스트(page.spec)용 — Next 라우팅은 default export 만 본다(named 무시).
export async function DashboardSection({ params }: { params: Params }) {
  const { id } = await params;
  const { user } = await getAuthedUser();
  if (!user) redirect("/login");

  const detail = await fetchChallengeDetail(id);
  if (!detail) notFound();

  // 시간 의존: render 시점 now 1회(spec C0). running 만 today 의존, over/closed 는 deterministic.
  const now = new Date();
  const phase = challengePhase(detail.status, detail.endAt, now.getTime());
  const daysLeft = detail.endAt ? remainingDays(detail.endAt, now.getTime()) : null;

  // viewer 개인 주차 칩·이번 주 상태 — 시작된 챌린지만.
  const startKey = detail.startAt ? toKstDayKey(detail.startAt) : null;
  const settleable = phase === "running" || phase === "over" || phase === "closed";
  const viewer = detail.members.find((m) => m.id === user.id);
  // 링·칩은 표시 집합(peer_rejected 제외, EVAL-0039). pot 은 challenge-detail 내부에서 full(doneByWeek)로 별도 계산.
  const viewerVisibleDoneByWeek = viewer?.visibleDoneByWeek ?? new Map<number, number>();

  let weeks: ReturnType<typeof buildWeekChips> = [];
  let currentWeek: ReturnType<typeof currentWeekStatus> = null;
  if (settleable && startKey) {
    const ctx: CutoffContext = {
      phase: phase as CutoffPhase,
      durationDays: detail.durationDays,
      todayDayIndex: dayIndexOf(toKstDayKey(now), startKey),
      closedAt: detail.closedAt,
      startKey,
    };
    const params = { goalCount: detail.goalCount, penaltyAmount: detail.penaltyAmount };
    weeks = buildWeekChips(viewerVisibleDoneByWeek, ctx, params);
    currentWeek = currentWeekStatus(viewerVisibleDoneByWeek, ctx, params);
  }

  return (
    <DashboardTab
      potTotal={detail.potTotal}
      weeks={weeks}
      currentWeek={currentWeek}
      daysRemaining={daysLeft}
      phase={phase}
      goalCount={detail.goalCount}
      members={detail.members}
    />
  );
}

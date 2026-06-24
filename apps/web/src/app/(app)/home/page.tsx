import { Suspense } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { fetchCurrentChallenges } from "@/lib/db/reads/current-challenges";
import { fetchPenaltyWaiting } from "@/lib/db/reads/penalty-waiting";
import { fetchMyDisplayName, hasEverCreatedChallenge } from "@/lib/db/reads/me";
import { HomeGreeting } from "./_components/home-greeting";
import {
  InvitedChallengeBanner,
  type InvitedChallenge,
} from "./_components/invited-challenge-banner";
import { StatsGrid } from "./_components/stats-grid";
import { RunningChallengeList } from "./_components/running-challenge-list";
import { SettlementPendingList } from "./_components/settlement-pending-list";
import { PenaltyWaitingList } from "./_components/penalty-waiting-list";
import { PwaGate } from "./_components/pwa-gate";

// Phase 5-1: cached read 를 Suspense 안에서 호출하기 위해 page 셸 분리.
// 모킹업 §2 — 빈/진행 두 상태. AppHeader 는 (app)/layout.tsx 가 렌더.
export default function HomePage() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeSection />
    </Suspense>
  );
}

function HomeFallback() {
  return (
    <div className="flex flex-col gap-4 p-4" aria-busy="true" aria-label="홈 로딩 중">
      <div className="bg-muted h-12 w-1/2 animate-pulse rounded-2xl" />
      <div className="bg-muted h-24 w-full animate-pulse rounded-2xl" />
      <div className="bg-muted h-40 w-full animate-pulse rounded-2xl" />
    </div>
  );
}

async function HomeSection() {
  const user = await requireUser();
  const supabase = await createClient();

  const [groups, displayName, penaltyWaiting] = await Promise.all([
    fetchCurrentChallenges(user.id),
    fetchMyDisplayName(user.id),
    fetchPenaltyWaiting(user.id),
  ]);

  // ADR-0027 — stats("진행 N개"·"예정 벌금")는 running 만. over(만기)는 정산 대상이라 제외.
  const activeChallenges = groups
    .map((g) => g.challenge)
    .filter((c): c is NonNullable<typeof c> => c?.phase === "running" && c.userIsParticipant);
  const pendingChallenges = groups
    .map((g) => ({ groupName: g.groupName, challenge: g.challenge }))
    .filter(
      (g): g is { groupName: string | null; challenge: NonNullable<typeof g.challenge> } =>
        g.challenge?.status === "pending",
    );

  let invites: InvitedChallenge[] = [];
  if (pendingChallenges.length > 0) {
    const pendingIds = pendingChallenges.map((p) => p.challenge.id);
    const { data: myParts } = await supabase
      .from("challenge_participants")
      .select("challenge_id, signed_at")
      .eq("user_id", user.id)
      .in("challenge_id", pendingIds)
      .is("signed_at", null);
    const unsignedIds = new Set((myParts ?? []).map((r) => r.challenge_id));
    invites = pendingChallenges
      .filter((p) => unsignedIds.has(p.challenge.id))
      .map((p) => ({
        challengeId: p.challenge.id,
        title: p.challenge.title,
        groupName: p.groupName,
      }));
  }

  const stats = {
    activeCount: activeChallenges.length,
    completedToday: activeChallenges.filter((c) => c.verifiedToday).length,
    pendingToday: activeChallenges.filter((c) => !c.verifiedToday).length,
    // 홈 stat = "내 벌금" — 끝난 주 미달 합(확정·단조). current-challenges 가 주 단위로 산정.
    // 인증해도 즉시 0으로 안 떨어진다(현재 주 위험은 현황판 링이 담당 — spec C0).
    totalPenalty: activeChallenges.reduce((sum, c) => sum + c.myConfirmedPenalty, 0),
  };

  // 모킹업 §2-A — 빈 상태 분기 기준은 "그룹 존재"가 아니라 "진행/대기 챌린지 존재".
  // fetchCurrentChallenges 가 status IN (pending, accepted, active) 만 채우므로,
  // challenge !== null ↔ 현재 활성/대기 챌린지가 그 그룹에 있다.
  const hasAnyChallenge = groups.some((g) => g.challenge !== null);

  // 빈 상태 카피 분기 — spec C1 단락 평가로 진행 중 챌린지가 있는 사용자에겐 호출 안 함.
  const hasEverCreated = hasAnyChallenge ? false : await hasEverCreatedChallenge(user.id);
  const emptyDescription = hasEverCreated
    ? "친구들과 함께 챌린지를 만들어보세요"
    : "친구들과 함께 첫 챌린지를 만들어보세요";

  return (
    <div className="flex flex-col gap-4 p-4">
      <PwaGate />
      <HomeGreeting displayName={displayName ?? "친구"} />

      {/* 만회 찬스 대기(spec §C3 진입점) — closed 챌린지라 hasAnyChallenge 분기 밖에서 항상 노출. 빈 배열이면 null. */}
      <PenaltyWaitingList items={penaltyWaiting} />

      {hasAnyChallenge ? (
        <>
          <InvitedChallengeBanner invites={invites} />
          <StatsGrid {...stats} />
          <RunningChallengeList groups={groups} />
          <SettlementPendingList groups={groups} />
        </>
      ) : (
        <EmptyState
          icon={Sparkles}
          title="아직 진행 중인 챌린지가 없어요"
          description={emptyDescription}
          action={
            <Link
              href="/challenge/new"
              className={cn(buttonVariants({ size: "lg" }), "h-11 gap-2 px-4")}
            >
              <Sparkles aria-hidden="true" className="size-4" />
              챌린지 만들기
            </Link>
          }
        />
      )}
    </div>
  );
}

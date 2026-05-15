import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { fetchCurrentChallenges } from "@/lib/db/reads/current-challenges";
import { fetchMyDisplayName } from "@/lib/db/reads/me";
import { HomeGreeting } from "./_components/home-greeting";
import {
  InvitedChallengeBanner,
  type InvitedChallenge,
} from "./_components/invited-challenge-banner";
import { StatsGrid } from "./_components/stats-grid";
import { RunningChallengeList } from "./_components/running-challenge-list";

// 모킹업 §2 — 빈/진행 두 상태. AppHeader 는 (app)/layout.tsx 가 렌더.
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [groups, displayName] = await Promise.all([
    fetchCurrentChallenges(user.id),
    fetchMyDisplayName(user.id),
  ]);

  const activeChallenges = groups
    .map((g) => g.challenge)
    .filter((c): c is NonNullable<typeof c> => c?.status === "active");
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
    totalPenalty: activeChallenges.reduce((sum, c) => sum + c.potTotal, 0),
  };

  const hasAnyGroup = groups.length > 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      <HomeGreeting displayName={displayName ?? "친구"} />

      {hasAnyGroup ? (
        <>
          <InvitedChallengeBanner invites={invites} />
          <StatsGrid {...stats} />
          <RunningChallengeList groups={groups} />
        </>
      ) : (
        <EmptyState
          icon={Sparkles}
          title="아직 진행 중인 챌린지가 없어요"
          description="친구들과 함께 첫 챌린지를 만들어보세요"
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

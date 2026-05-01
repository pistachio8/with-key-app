import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchRecap } from "@/lib/db/reads/recap";
import { track } from "@/lib/analytics/track";
import { RecapHero } from "./_components/recap-hero";
import { RecapStatsRow } from "./_components/recap-stats-row";
import { RecapMembersList } from "./_components/recap-members-list";

// PRD §10 화면 8 · §11.1 Day 7 Happy Path · §9.1 penalty_displayed.
export default async function RecapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const recap = await fetchRecap(user.id);

  if (!recap) {
    return (
      <div className="flex flex-col gap-6 p-4">
        <h1 className="text-xl font-semibold">주간 정산</h1>
        <p className="text-muted-foreground break-keep text-sm">
          아직 끝난 챌린지가 없어요. 챌린지가 끝나면 결과를 여기서 돌아봐요.
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

  // PRD §9.1 — fire-and-forget, never throws.
  void track(
    { name: "penalty_displayed", props: { amount: recap.viewerPerHeadPenalty } },
    { userId: user.id },
  );

  return (
    <div className="flex flex-col gap-6 p-4">
      <RecapHero
        title={recap.title}
        startAt={recap.startAt}
        endAt={recap.endAt}
        viewerAchieved={recap.viewerAchieved}
        anyoneAchieved={recap.anyoneAchieved}
      />
      <RecapStatsRow
        viewerDoneCount={recap.viewerDoneCount}
        goalCount={recap.goalCount}
        viewerPerHeadPenalty={recap.viewerPerHeadPenalty}
      />
      <RecapMembersList goalCount={recap.goalCount} members={recap.members} />
    </div>
  );
}

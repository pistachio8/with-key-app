import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchRecap } from "@/lib/db/reads/recap";
import { track } from "@/lib/analytics/track";
import { RecapHero } from "./_components/recap-hero";
import { RecapStatsRow } from "./_components/recap-stats-row";
import { RecapMembersList } from "./_components/recap-members-list";

type Params = Promise<{ id: string }>;

// 모킹업 §11 정산 · PRD §10 — ADR-0002: challenge sub-route.
export default async function RecapPage({ params }: { params: Params }) {
  const { id: challengeId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const recap = await fetchRecap(user.id, { challengeId });

  if (!recap) {
    return (
      <div className="flex flex-col gap-6 p-4">
        <h1 className="t-h2">주간 정산</h1>
        <p className="t-sub break-keep">
          아직 결과가 없어요. 챌린지가 끝나면 결과를 여기서 돌아봐요.
        </p>
        <Link
          href={`/challenge/${challengeId}`}
          className="text-primary w-fit text-sm font-semibold underline-offset-4 hover:underline"
        >
          챌린지로 가기
        </Link>
      </div>
    );
  }

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
        isSolo={recap.members.length === 1}
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

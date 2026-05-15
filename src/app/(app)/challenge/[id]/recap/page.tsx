import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchRecap } from "@/lib/db/reads/recap";
import { track } from "@/lib/analytics/track";
import { AccountInlinePrompt } from "./_components/account-inline-prompt";
import { RecapActions } from "./_components/recap-actions";
import { RecapEndCard } from "./_components/recap-end-card";
import { RecapHero } from "./_components/recap-hero";
import { RecapMembersList } from "./_components/recap-members-list";
import { RecapStatsRow } from "./_components/recap-stats-row";

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

  const isOwner = recap.group?.ownerId === user.id;
  const hasAccount = !!(
    recap.group?.bankCode &&
    recap.group?.accountHolder &&
    recap.group?.accountNumberLast4
  );
  // 모킹업 §11 — "최종 벌금" = 미달성자 수 × penalty_amount.
  const totalPenalty = recap.members.reduce(
    (sum, m) => sum + (m.achieved ? 0 : recap.penaltyAmount),
    0,
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <RecapHero
        title={recap.title}
        startAt={recap.startAt}
        endAt={recap.endAt}
        viewerAchieved={recap.viewerAchieved}
        anyoneAchieved={recap.anyoneAchieved}
        isSolo={recap.members.length === 1}
      />
      <RecapEndCard totalPenalty={totalPenalty} viewerPerHeadPenalty={recap.viewerPerHeadPenalty} />
      <RecapStatsRow
        viewerDoneCount={recap.viewerDoneCount}
        goalCount={recap.goalCount}
        viewerPerHeadPenalty={recap.viewerPerHeadPenalty}
      />
      <RecapMembersList goalCount={recap.goalCount} members={recap.members} />
      {recap.group && !hasAccount && (
        <AccountInlinePrompt
          groupId={recap.group.id}
          isOwner={isOwner}
          bankCode={recap.group.bankCode}
          accountHolder={recap.group.accountHolder}
        />
      )}
      <RecapActions title={recap.title} totalPenalty={totalPenalty} />
    </div>
  );
}

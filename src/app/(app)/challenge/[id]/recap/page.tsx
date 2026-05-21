// src/app/(app)/challenge/[id]/recap/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchRecap } from "@/lib/db/reads/recap";
import { fetchChallengePhotos } from "@/lib/db/reads/challenge-photos";
import { track } from "@/lib/analytics/track";
import { formatKRW } from "@/lib/challenge/penalty";
import { AccountInlinePrompt } from "./_components/account-inline-prompt";
import { InvitationHeader } from "./_components/invitation-header";
import { PhotoGallery } from "./_components/photo-gallery";
import { MemberRoster } from "./_components/member-roster";
import { SettlementAccount } from "./_components/settlement-account";
import { MyPenaltyCard } from "./_components/my-penalty-card";
import { ShareCardAction } from "./_components/share-card-action";

type Params = Promise<{ id: string }>;

// 모킹업 §11 정산 · PRD §10 — ADR-0002: challenge sub-route.
export default async function RecapPage({ params }: { params: Params }) {
  const { id: challengeId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [recap, photos] = await Promise.all([
    fetchRecap(user.id, { challengeId }),
    fetchChallengePhotos(challengeId, { client: supabase }),
  ]);

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
  const isSolo = recap.members.length === 1;
  const groupName = recap.group?.name ?? "우리 그룹";
  const shareMessage = `${recap.title} 종료! 최종 벌금 ${formatKRW(totalPenalty)} · with-key`;

  return (
    <div className="flex flex-col gap-4 p-4">
      {recap.group && !hasAccount && (
        <AccountInlinePrompt
          groupId={recap.group.id}
          isOwner={isOwner}
          bankCode={recap.group.bankCode}
          accountHolder={recap.group.accountHolder}
        />
      )}

      <MyPenaltyCard
        doneCount={recap.viewerDoneCount}
        goalCount={recap.goalCount}
        viewerAchieved={recap.viewerAchieved}
        viewerPerHeadPenalty={recap.viewerPerHeadPenalty}
        totalPenalty={totalPenalty}
      />

      {!isSolo && recap.startAt && recap.endAt && (
        <>
          <InvitationHeader
            groupName={groupName}
            title={recap.title}
            startAt={recap.startAt}
            endAt={recap.endAt}
            durationDays={recap.durationDays}
          />
          <PhotoGallery photos={photos} />
          <MemberRoster
            members={recap.members.map((m) => ({
              id: m.id,
              displayName: m.displayName,
              isMvp: m.isMvp,
            }))}
          />
          <SettlementAccount
            bankCode={recap.group?.bankCode ?? null}
            holder={recap.group?.accountHolder ?? null}
            last4={recap.group?.accountNumberLast4 ?? null}
          />
        </>
      )}

      <ShareCardAction challengeId={challengeId} shareMessage={shareMessage} />
    </div>
  );
}

import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { challengePhase, isChallengeOver, remainingDays } from "@/lib/challenge/lifecycle";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { getAuthedUser } from "@/lib/supabase/auth";
import { ChallengeEndedBanner } from "../_components/challenge-ended-banner";
import { ChallengeOwnerMenu } from "../_components/challenge-owner-menu";
import { JustJoinedBannerSlot, JoinedLateCard } from "../_components/query-aware-banners";
import { StartChallengeCard } from "../_components/start-challenge-card";
import { StatusCard } from "../_components/status-card";
import { TabNav } from "../_components/tab-nav";

type Params = Promise<{ id: string }>;

// Next.js 16 cacheComponents: 셸은 sync — children 만 통과해 static prerender 가능.
// dynamic params/auth/fetch 는 LayoutHeader async 자식으로 격리되어 Suspense 안에서 평가.
export default function ChallengeDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Params;
}) {
  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <Suspense fallback={<LayoutHeaderFallback />}>
        <LayoutHeader params={params} />
      </Suspense>
      {children}
    </div>
  );
}

function LayoutHeaderFallback() {
  return (
    <div
      className="bg-muted/40 h-40 w-full animate-pulse rounded-2xl"
      aria-busy="true"
      aria-label="챌린지 정보 로딩 중"
    />
  );
}

async function LayoutHeader({ params }: { params: Params }) {
  const { id } = await params;

  const { user } = await getAuthedUser();
  if (!user) redirect("/login");

  const detail = await fetchChallengeDetail(id);
  if (!detail) notFound();

  const me = detail.members.find((m) => m.id === user.id);
  const isParticipant = me != null;
  const mySigned = me?.signed ?? false;
  const isOwner = detail.group.ownerId === user.id;
  // ADR-0027 — 종료 판정·D-N 은 phase(status + end_at) 로 일원화. over 면 배너 + StatusCard "종료".
  const phase = challengePhase(detail.status, detail.endAt);
  const showEndedBanner = isChallengeOver(detail.status, detail.endAt);

  const ownerName =
    detail.members.find((m) => m.id === detail.group.ownerId)?.displayName ?? "운영자";
  const totalSigned = detail.members.filter((m) => m.signed).length;
  const unsignedCount = detail.members.length - totalSigned;
  const daysLeft = detail.endAt ? remainingDays(detail.endAt) : null;

  return (
    <>
      {isOwner && (
        <div className="flex justify-end">
          <ChallengeOwnerMenu challengeId={id} isOwner={isOwner} status={detail.status} />
        </div>
      )}
      {showEndedBanner && <ChallengeEndedBanner challengeId={id} />}
      <JustJoinedBannerSlot totalSigned={totalSigned} totalMembers={detail.members.length} />
      <JoinedLateCard />
      <StatusCard
        title={detail.title}
        phase={phase}
        goalCount={detail.goalCount}
        durationDays={detail.durationDays}
        penaltyAmount={detail.penaltyAmount}
        participantCount={detail.participantCount}
        signedCount={totalSigned}
        isOwner={isOwner}
        ownerName={ownerName}
        daysLeft={daysLeft}
      />
      {isParticipant && !mySigned && detail.status === "pending" && (
        <Card padding="sm" className="bg-destructive/10 border-transparent">
          <div className="text-destructive flex items-center gap-2 text-[11px]">
            <AlertCircle className="size-3.5" aria-hidden="true" />
            <span>운영자가 작성한 서약서를 확인하고 서명하면 챌린지에 참여돼요</span>
          </div>
        </Card>
      )}
      {isOwner && detail.status === "pending" && mySigned && (
        <StartChallengeCard
          challengeId={id}
          signedCount={totalSigned}
          unsignedCount={unsignedCount}
        />
      )}
      <TabNav challengeId={id} />
    </>
  );
}

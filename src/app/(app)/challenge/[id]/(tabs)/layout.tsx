import { notFound, redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { getAuthedUser } from "@/lib/supabase/auth";
import { ChallengeEndedBanner } from "../_components/challenge-ended-banner";
import { ChallengeOwnerMenu } from "../_components/challenge-owner-menu";
import { JustJoinedBannerSlot, JoinedLateCard } from "../_components/query-aware-banners";
import { StartChallengeCard } from "../_components/start-challenge-card";
import { StatusCard } from "../_components/status-card";
import { TabNav } from "../_components/tab-nav";

type Params = Promise<{ id: string }>;

function computeDaysLeft(endAtIso: string | null): number | null {
  if (!endAtIso) return null;
  return Math.max(0, Math.ceil((new Date(endAtIso).getTime() - Date.now()) / 86_400_000));
}

// Next.js 16: layout 은 searchParams 를 받지 않는다. ?tab=·?just_joined redirect 는
// root page.tsx 에서 처리. query 의존 banner 는 client wrapper (query-aware-banners) 사용.
export default async function ChallengeDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Params;
}) {
  const { id } = await params;

  const { user } = await getAuthedUser();
  if (!user) redirect("/login");

  const detail = await fetchChallengeDetail(id);
  if (!detail) notFound();

  const me = detail.members.find((m) => m.id === user.id);
  const isParticipant = me != null;
  const mySigned = me?.signed ?? false;
  const isOwner = detail.group.ownerId === user.id;
  const isEndedByDate =
    detail.status === "active" && detail.endAt != null && new Date(detail.endAt) < new Date();
  const showEndedBanner = detail.status === "closed" || isEndedByDate;

  const ownerName =
    detail.members.find((m) => m.id === detail.group.ownerId)?.displayName ?? "운영자";
  const totalSigned = detail.members.filter((m) => m.signed).length;
  const unsignedCount = detail.members.length - totalSigned;
  const daysLeft = computeDaysLeft(detail.endAt);

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
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
        status={detail.status}
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
      {children}
    </div>
  );
}

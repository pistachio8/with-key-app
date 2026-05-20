import { notFound, redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { getAuthedUser } from "@/lib/supabase/auth";
import { ChallengeEndedBanner } from "./_components/challenge-ended-banner";
import { ChallengeOwnerMenu } from "./_components/challenge-owner-menu";
import { JustJoinedBanner } from "./_components/just-joined-banner";
import { StartChallengeCard } from "./_components/start-challenge-card";
import { StatusCard } from "./_components/status-card";
import { TabNav } from "./_components/tab-nav";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  tab?: string;
  just_joined?: string;
  activated?: string;
  joined_late?: string;
}>;

function computeDaysLeft(endAtIso: string | null): number | null {
  if (!endAtIso) return null;
  return Math.max(0, Math.ceil((new Date(endAtIso).getTime() - Date.now()) / 86_400_000));
}

export default async function ChallengeDetailLayout({
  children,
  params,
  searchParams,
}: {
  children: React.ReactNode;
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;

  // 호환 redirect: tab 제외 query 보존 + just_joined 진입은 info 탭으로.
  const preserved = new URLSearchParams();
  if (sp.just_joined === "1") preserved.set("just_joined", "1");
  if (sp.activated === "1") preserved.set("activated", "1");
  if (sp.joined_late === "1") preserved.set("joined_late", "1");
  const preservedQuery = preserved.toString() ? `?${preserved.toString()}` : "";

  if (sp.tab === "dashboard") redirect(`/challenge/${id}/dashboard${preservedQuery}`);
  if (sp.tab === "info") redirect(`/challenge/${id}/info${preservedQuery}`);
  if (sp.tab === undefined && sp.just_joined === "1") {
    redirect(`/challenge/${id}/info${preservedQuery}`);
  }

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

  const justJoined = sp.just_joined === "1";
  const activated = sp.activated === "1";
  const joinedLate = sp.joined_late === "1";

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      {isOwner && (
        <div className="flex justify-end">
          <ChallengeOwnerMenu challengeId={id} isOwner={isOwner} status={detail.status} />
        </div>
      )}
      {showEndedBanner && <ChallengeEndedBanner challengeId={id} />}
      {justJoined && (
        <JustJoinedBanner
          activated={activated}
          totalSigned={totalSigned}
          totalMembers={detail.members.length}
        />
      )}
      {joinedLate && (
        <Card padding="sm" className="bg-muted/50 border-transparent">
          <p className="text-muted-foreground break-keep text-xs">
            이미 시작된 챌린지예요. 그룹에는 합류했고, 다음 챌린지부터 함께할 수 있어요.
          </p>
        </Card>
      )}
      <StatusCard
        title={detail.title}
        status={detail.status}
        goalCount={detail.goalCount}
        durationDays={detail.durationDays}
        penaltyAmount={detail.penaltyAmount}
        participantCount={detail.participantCount}
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

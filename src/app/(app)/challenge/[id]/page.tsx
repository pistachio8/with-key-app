import { notFound, redirect } from "next/navigation";
import { AlertCircle, Camera } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Fab } from "@/components/ui/fab";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { fetchChallengeFeed } from "@/lib/db/reads/challenge-feed";
import { createClient } from "@/lib/supabase/server";
import { InviteTrigger } from "@/app/(app)/group/[id]/_components/invite-trigger";
import { AccountInfoTrigger } from "./_components/account-info-trigger";
import { ChallengeTabs } from "./_components/challenge-tabs";
import { DashboardTab } from "./_components/dashboard-tab";
import { FeedTab } from "./_components/feed-tab";
import { InfoTab } from "./_components/info-tab";
import { JustJoinedBanner } from "./_components/just-joined-banner";
import { StatusCard } from "./_components/status-card";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ just_joined?: string; activated?: string; tab?: string }>;

function computeDaysLeft(endAtIso: string | null): number | null {
  if (!endAtIso) return null;
  return Math.max(0, Math.ceil((new Date(endAtIso).getTime() - Date.now()) / 86_400_000));
}

function isSameLocalDay(iso: string, now = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// 모킹업 §6 — 3-tab 셸 + StatusCard. ?just_joined=1 진입은 §7 흡수. FAB은 info 외 탭에서만.
export default async function ChallengeDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const justJoined = sp.just_joined === "1";
  const activated = sp.activated === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const detail = await fetchChallengeDetail(id);
  if (!detail) notFound();
  const feed = await fetchChallengeFeed(id, user.id);

  const me = detail.members.find((m) => m.id === user.id);
  const isParticipant = me != null;
  const mySigned = me?.signed ?? false;

  const owner = detail.members.find((m) => m.id === detail.group.ownerId);
  const ownerName = owner?.displayName ?? "운영자";
  const totalSigned = detail.members.filter((m) => m.signed).length;
  const daysLeft = computeDaysLeft(detail.endAt);

  // 오늘 인증한 멤버 = 오늘 created_at 인 action_logs 의 authorId set.
  const todayAuthorIds = new Set(
    feed.filter((f) => isSameLocalDay(f.createdAt)).map((f) => f.authorId),
  );
  const todayDoneCount = todayAuthorIds.size;
  const todayMissingNames = detail.members
    .filter((m) => !todayAuthorIds.has(m.id))
    .map((m) => (m.id === user.id ? "나" : m.displayName));

  // 누적 벌금·실패 수 placeholder — 인증 실패 감지(#35) 결정 전. 결정 후 채움.
  const totalFailures = 0;
  const totalPenalty = totalFailures * detail.penaltyAmount;

  const inviteSlot =
    user.id === detail.group.ownerId ? (
      <section aria-label="초대">
        <InviteTrigger groupId={detail.group.id} />
      </section>
    ) : null;
  const accountSlot = (
    <section aria-label="정산 계좌" className="flex items-center justify-end">
      <AccountInfoTrigger
        groupId={detail.group.id}
        bankCode={detail.group.bankCode}
        accountHolder={detail.group.accountHolder}
        accountNumberLast4={detail.group.accountNumberLast4}
      />
    </section>
  );

  const fab = isParticipant && detail.status === "active" ? <ActionFab id={id} /> : null;

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      {justJoined && (
        <JustJoinedBanner
          activated={activated}
          totalSigned={totalSigned}
          totalMembers={detail.members.length}
        />
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
      <ChallengeTabs
        feed={
          <FeedTab
            viewerId={user.id}
            feed={feed}
            participantCount={detail.participantCount}
            todayDoneCount={todayDoneCount}
            todayMissingNames={todayMissingNames}
            status={detail.status}
            isParticipant={isParticipant}
            mySigned={mySigned}
          />
        }
        dashboard={
          <DashboardTab
            totalPenalty={totalPenalty}
            totalActions={feed.length}
            totalFailures={totalFailures}
            daysRemaining={daysLeft}
            members={detail.members}
            goalCount={detail.goalCount}
          />
        }
        info={
          <InfoTab
            detail={detail}
            ownerName={ownerName}
            inviteSlot={inviteSlot}
            accountSlot={accountSlot}
          />
        }
        defaultTab={justJoined ? "info" : "feed"}
        fab={fab}
      />
    </div>
  );
}

function ActionFab({ id }: { id: string }) {
  return (
    <Fab
      href={`/challenge/${id}/action`}
      label="인증하기"
      icon={Camera}
      className="fixed bottom-6 left-1/2 z-20 -translate-x-1/2"
    />
  );
}

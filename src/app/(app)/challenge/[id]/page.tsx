import { notFound, redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatKRW } from "@/lib/challenge/penalty";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { fetchChallengeFeed } from "@/lib/db/reads/challenge-feed";
import { createClient } from "@/lib/supabase/server";
import { InviteTrigger } from "@/app/(app)/group/[id]/_components/invite-trigger";
import { MemberStrip } from "./_components/member-strip";
import { AccountInfoTrigger } from "./_components/account-info-trigger";
import { ChallengeFeed } from "./_components/challenge-feed";
import { NextStepCta } from "./_components/next-step-cta";
import { StartActionButton } from "./_components/start-action-button";
import { ChallengeTabs } from "./_components/challenge-tabs";
import { StatusCard } from "./_components/status-card";
import { InfoTab } from "./_components/info-tab";
import { JustJoinedBanner } from "./_components/just-joined-banner";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ just_joined?: string; activated?: string }>;

function computeDaysLeft(endAtIso: string | null): number | null {
  if (!endAtIso) return null;
  return Math.max(0, Math.ceil((new Date(endAtIso).getTime() - Date.now()) / 86_400_000));
}

// 모킹업 §6 — 3-tab 셸 + StatusCard. ?just_joined=1 진입은 §7 흡수.
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
  const isSolo = detail.participantCount === 1;
  const showStartButton = isParticipant && detail.status === "active";
  let pushSubscribed = false;
  if (showStartButton) {
    const { count } = await supabase
      .from("push_subscriptions")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", user.id);
    pushSubscribed = (count ?? 0) > 0;
  }

  const owner = detail.members.find((m) => m.id === detail.group.ownerId);
  const ownerName = owner?.displayName ?? "운영자";
  const totalSigned = detail.members.filter((m) => m.signed).length;
  const daysLeft = computeDaysLeft(detail.endAt);

  const feedTab = (
    <div className="flex flex-col gap-4">
      {showStartButton ? (
        <section aria-label="운동 시작">
          <StartActionButton challengeId={id} pushSubscribed={pushSubscribed} />
        </section>
      ) : (
        <section aria-label="다음 액션">
          <NextStepCta
            status={detail.status}
            isParticipant={isParticipant}
            mySigned={mySigned}
            isSolo={isSolo}
          />
        </section>
      )}
      <section aria-labelledby="feed-heading">
        <h2 id="feed-heading" className="t-h3 mb-3">
          최근 인증
        </h2>
        <ChallengeFeed items={feed} viewerId={user.id} participantCount={detail.participantCount} />
      </section>
    </div>
  );

  const dashboardTab = (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="member-progress-heading">
        <h2 id="member-progress-heading" className="t-h3 mb-3">
          멤버 진행률
        </h2>
        <MemberStrip goalCount={detail.goalCount} members={detail.members} />
      </section>
      <section
        aria-labelledby="settlement-heading"
        className="bg-card flex items-center justify-between rounded-2xl border p-4"
      >
        <div>
          <p id="settlement-heading" className="text-muted-foreground text-xs">
            모인 예정 벌금
          </p>
          <p className="text-xl font-bold tabular-nums">{formatKRW(detail.potTotal)}</p>
        </div>
        <AccountInfoTrigger
          groupId={detail.group.id}
          bankCode={detail.group.bankCode}
          accountHolder={detail.group.accountHolder}
          accountNumberLast4={detail.group.accountNumberLast4}
        />
      </section>
    </div>
  );

  const inviteSlot =
    user.id === detail.group.ownerId ? (
      <section aria-label="초대">
        <InviteTrigger groupId={detail.group.id} />
      </section>
    ) : null;

  return (
    <div className="flex flex-col gap-4 p-4">
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
        feed={feedTab}
        dashboard={dashboardTab}
        info={<InfoTab detail={detail} ownerName={ownerName} inviteSlot={inviteSlot} />}
        defaultTab={justJoined ? "info" : "feed"}
      />
    </div>
  );
}

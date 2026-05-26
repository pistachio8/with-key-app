import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { getAuthedUser } from "@/lib/supabase/auth";
import { InviteTrigger } from "@/app/(app)/group/[id]/_components/invite-trigger";
import { AccountInfoTrigger } from "../../_components/account-info-trigger";
import { InfoTab } from "../../_components/info-tab";
import { StartChallengeCard } from "../../_components/start-challenge-card";
import InfoLoading from "./loading";

type Params = Promise<{ id: string }>;

// Next.js 16 cacheComponents: 셸은 sync, dynamic await 는 InfoSection 자식에서.
export default function ChallengeInfoPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<InfoLoading />}>
      <InfoSection params={params} />
    </Suspense>
  );
}

async function InfoSection({ params }: { params: Params }) {
  const { id } = await params;
  const { user } = await getAuthedUser();
  if (!user) redirect("/login");

  const detail = await fetchChallengeDetail(id);
  if (!detail) notFound();

  const me = detail.members.find((m) => m.id === user.id);
  const mySigned = me?.signed ?? false;
  const isOwner = detail.group.ownerId === user.id;
  const ownerName =
    detail.members.find((m) => m.id === detail.group.ownerId)?.displayName ?? "운영자";
  const totalSigned = detail.members.filter((m) => m.signed).length;
  const unsignedCount = detail.members.length - totalSigned;

  const inviteSlot = isOwner ? (
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
  const startSlot =
    isOwner && detail.status === "pending" && mySigned ? (
      <StartChallengeCard
        challengeId={id}
        signedCount={totalSigned}
        unsignedCount={unsignedCount}
      />
    ) : null;

  return (
    <InfoTab
      detail={detail}
      ownerName={ownerName}
      inviteSlot={inviteSlot}
      accountSlot={accountSlot}
      startSlot={startSlot}
    />
  );
}

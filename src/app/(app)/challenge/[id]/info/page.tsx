import { notFound, redirect } from "next/navigation";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { getAuthedUser } from "@/lib/supabase/auth";
import { InviteTrigger } from "@/app/(app)/group/[id]/_components/invite-trigger";
import { AccountInfoTrigger } from "../_components/account-info-trigger";
import { InfoTab } from "../_components/info-tab";
import { StartChallengeCard } from "../_components/start-challenge-card";

type Params = Promise<{ id: string }>;

export default async function ChallengeInfoPage({ params }: { params: Params }) {
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

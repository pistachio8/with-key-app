import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { getAuthedUser } from "@/lib/supabase/auth";
import { InviteTrigger } from "@/app/(app)/group/[id]/_components/invite-trigger";
import { AccountInfoTrigger } from "../../_components/account-info-trigger";
import { InfoTab } from "../../_components/info-tab";
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

  const isOwner = detail.group.ownerId === user.id;
  const ownerName =
    detail.members.find((m) => m.id === detail.group.ownerId)?.displayName ?? "운영자";

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
  return (
    <InfoTab
      detail={detail}
      ownerName={ownerName}
      inviteSlot={inviteSlot}
      accountSlot={accountSlot}
    />
  );
}

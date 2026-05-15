import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { fetchGroupDetail } from "@/lib/db/reads/group-detail";
import { GroupHeader } from "./_components/group-header";
import { GroupAccountCard } from "./_components/group-account-card";
import { GroupMembers } from "./_components/group-members";
import { GroupChallengesList } from "./_components/group-challenges-list";

type Params = Promise<{ id: string }>;

// 모킹업 §12 - 그룹 상세. 멤버·계좌·챌린지 목록. 운영자만 계좌 추가/변경.
export default async function GroupDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const user = await requireUser();
  const detail = await fetchGroupDetail(id);
  if (!detail) notFound();

  const isOwner = detail.ownerId === user.id;

  return (
    <div className="flex flex-col gap-4 p-4">
      <GroupHeader name={detail.name} isOwner={isOwner} memberCount={detail.members.length} />
      <GroupAccountCard
        groupId={detail.id}
        bankCode={detail.bankCode}
        accountHolder={detail.accountHolder}
        accountNumberLast4={detail.accountNumberLast4}
        isOwner={isOwner}
      />
      <GroupMembers members={detail.members} />
      <GroupChallengesList challenges={detail.challenges} />
    </div>
  );
}

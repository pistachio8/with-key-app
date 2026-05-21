import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { fetchGroupDetail } from "@/lib/db/reads/group-detail";
import { GroupHeader } from "./_components/group-header";
import { GroupAccountCard } from "./_components/group-account-card";
import { GroupMembers } from "./_components/group-members";
import { GroupChallengesList } from "./_components/group-challenges-list";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ welcome?: string }>;

// 모킹업 §12 - 그룹 상세. 멤버·계좌·챌린지 목록. 운영자만 계좌 추가/변경.
// ADR-0008 — invite 자동가입 후 pending challenge 가 없으면 callback 이 ?welcome={groupName}
// 부착해 본 페이지로 redirect. 1회성 query (새로고침/이동 시 자연 소실).
export default async function GroupDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const welcome = typeof sp.welcome === "string" && sp.welcome.length > 0 ? sp.welcome : null;

  const user = await requireUser();
  const detail = await fetchGroupDetail(id);
  if (!detail) notFound();

  const isOwner = detail.ownerId === user.id;
  const hasOpenChallenge = detail.challenges.some((challenge) => challenge.status !== "closed");

  return (
    <div className="flex flex-col gap-4 p-4">
      {welcome && (
        <div
          role="status"
          aria-live="polite"
          className="bg-primary/5 border-primary/20 rounded-2xl border px-4 py-4 text-center"
        >
          <p className="text-foreground font-semibold">🎉 {welcome}에 합류했어요</p>
          <p className="text-muted-foreground mt-1 text-xs">여기서 챌린지를 함께 시작해 보세요</p>
        </div>
      )}
      <GroupHeader
        groupId={detail.id}
        name={detail.name}
        isOwner={isOwner}
        memberCount={detail.members.length}
        challengeCount={detail.challenges.length}
        hasOpenChallenge={hasOpenChallenge}
      />
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

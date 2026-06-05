import { Suspense } from "react";
import Link from "next/link";
import { Plus, Trophy } from "lucide-react";
import { requireUser } from "@/lib/auth/require-user";
import { fetchMyChallenges, deriveCounts } from "@/lib/db/reads/my-challenges";
import { EmptyState } from "@/components/ui/empty-state";
import { ManageCardList } from "./_components/manage-card-list";
import { ChallengeLimitChart } from "./_components/challenge-limit-chart";

const OWNER_LIMIT = 5;

// Phase 5-2: cached read 를 Suspense 안에서 호출하기 위해 page 셸 분리.
// 모킹업 §12 - 챌린지 관리. 운영/참여 분리 + 운영 슬롯 차트 + 빈 상태.
export default function MyChallengesPage() {
  return (
    <Suspense fallback={<MyChallengesFallback />}>
      <MyChallengesSection />
    </Suspense>
  );
}

function MyChallengesFallback() {
  return (
    <div className="flex flex-col gap-4 p-4" aria-busy="true" aria-label="챌린지 관리 로딩 중">
      <div className="bg-muted h-8 w-1/3 animate-pulse rounded-2xl" />
      <div className="bg-muted h-32 w-full animate-pulse rounded-2xl" />
      <div className="bg-muted h-40 w-full animate-pulse rounded-2xl" />
    </div>
  );
}

async function MyChallengesSection() {
  const user = await requireUser();
  const my = await fetchMyChallenges(user.id);
  const counts = deriveCounts(my);
  const totalAny = my.owner.length + my.member.length;

  // 모킹업 §12-A — "운영 중"/"참여 중" 은 active/pending/accepted 만,
  // closed 는 별도 "종료된 챌린지" 섹션으로 (owner+member 합쳐서).
  const ownerActive = my.owner.filter((c) => c.status !== "closed");
  const memberActive = my.member.filter((c) => c.status !== "closed");
  const closed = [...my.owner, ...my.member].filter((c) => c.status === "closed");

  if (totalAny === 0) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h1 className="t-h1">챌린지 관리</h1>
        <EmptyState
          icon={Trophy}
          title="아직 챌린지가 없어요"
          description="새 챌린지를 만들거나 친구의 초대를 받아보세요"
          action={
            <Link
              href="/challenge/new"
              className="bg-primary text-primary-foreground inline-flex items-center gap-1 rounded-full px-4 py-2 text-[13px] font-semibold transition-transform active:scale-95"
            >
              <Plus className="size-4" aria-hidden="true" /> 챌린지 만들기
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="t-h1">챌린지 관리</h1>
      <ChallengeLimitChart current={counts.owner} max={OWNER_LIMIT} />
      <ManageCardList title="운영 중" role="owner" items={ownerActive} />
      <ManageCardList title="참여 중" role="member" items={memberActive} />
      <ManageCardList title="종료된 챌린지" role="member" items={closed} />
    </div>
  );
}

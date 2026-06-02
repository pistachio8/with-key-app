import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/require-user";
import { fetchOwnerGroupsForChallengeForm } from "@/lib/db/reads/owner-groups-for-challenge-form";
import { NewChallengeForm } from "./_components/new-challenge-form";

type SearchParams = Promise<{ groupId?: string | string[] }>;

function firstSearchParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// Next.js 16 cacheComponents: 셸은 sync — dynamic 은 NewChallengeSection 자식에서.
// spec C8 — 가드 분기 매트릭스 (PRD AC-1 "그룹당 동시 1개" 일치).
// layout 이 searchParams 를 받지 못하므로 가드는 page 에서 처리한다.
export default function NewChallengePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<NewChallengeFallback />}>
      <NewChallengeSection searchParams={searchParams} />
    </Suspense>
  );
}

function NewChallengeFallback() {
  return (
    <div className="flex flex-col gap-3 p-4" aria-busy="true" aria-label="챌린지 폼 로딩 중">
      <div className="bg-muted h-10 w-full animate-pulse rounded-2xl" />
      <div className="bg-muted h-32 w-full animate-pulse rounded-2xl" />
      <div className="bg-muted h-12 w-full animate-pulse rounded-2xl" />
    </div>
  );
}

async function NewChallengeSection({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const requestedGroupId = firstSearchParam(sp.groupId);
  const ownerGroups = await fetchOwnerGroupsForChallengeForm(user.id);

  if (requestedGroupId) {
    const requested = ownerGroups.find((group) => group.id === requestedGroupId);
    if (requested?.openChallengeId) {
      redirect(`/challenge/${requested.openChallengeId}`);
    }
  } else if (ownerGroups.length >= 1) {
    const allOpen = ownerGroups.every((group) => group.openChallengeId !== null);
    if (allOpen) {
      // ownerGroups 는 latestChallengeCreatedAt desc 정렬 — 첫 그룹의 open 이 가장 최근.
      const latestOpen = ownerGroups[0]?.openChallengeId;
      if (latestOpen) redirect(`/challenge/${latestOpen}`);
    }
  }

  // initialGroupId: 요청한 그룹이 open 이 아닐 때만 그 그룹, 아니면 첫 select 가능 그룹.
  const requested = requestedGroupId
    ? ownerGroups.find((group) => group.id === requestedGroupId)
    : undefined;
  const firstSelectable = ownerGroups.find((group) => !group.openChallengeId);
  const initialGroupId =
    requested && !requested.openChallengeId ? requested.id : (firstSelectable?.id ?? null);

  return <NewChallengeForm ownerGroups={ownerGroups} initialGroupId={initialGroupId} />;
}

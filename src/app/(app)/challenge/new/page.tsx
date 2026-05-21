import { requireUser } from "@/lib/auth/require-user";
import { fetchOwnerGroupsForChallengeForm } from "@/lib/db/reads/owner-groups-for-challenge-form";
import { NewChallengeForm } from "./_components/new-challenge-form";

type SearchParams = Promise<{ groupId?: string | string[] }>;

function firstSearchParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function NewChallengePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const requestedGroupId = firstSearchParam(sp.groupId);
  const ownerGroups = await fetchOwnerGroupsForChallengeForm(user.id);
  const requestedOwnerGroup = ownerGroups.find((group) => group.id === requestedGroupId);
  const initialGroupId = requestedOwnerGroup?.id ?? ownerGroups[0]?.id ?? null;

  return <NewChallengeForm ownerGroups={ownerGroups} initialGroupId={initialGroupId} />;
}

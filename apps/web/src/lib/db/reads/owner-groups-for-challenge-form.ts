import "server-only";

import { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type OwnerGroupRow = {
  id: string;
  name: string | null;
  created_at: string;
};

// status 는 spec C8/PRD AC-1 의 open 정의(pending|accepted|active) 와 1:1.
type GroupChallengeRow = {
  id: string;
  group_id: string;
  status: string;
  created_at: string;
};

export type OwnerGroupForChallengeForm = {
  id: string;
  name: string | null;
  createdAt: string;
  latestChallengeCreatedAt: string | null;
  // PRD AC-1 — 그룹당 open(pending|accepted|active) 챌린지는 1개. 값이 있으면
  // /challenge/new page 가드가 그 챌린지로 redirect 하거나 select item 을 disabled 로 표시.
  openChallengeId: string | null;
};

const OPEN_STATUSES = new Set(["pending", "accepted", "active"]);

type OwnerGroupsReadResult =
  | { ok: true; groups: OwnerGroupForChallengeForm[] }
  | { ok: false; groups: []; error: unknown };

function compareIsoDesc(left: string | null, right: string | null): number {
  if (left && right) return right.localeCompare(left);
  if (left) return -1;
  if (right) return 1;
  return 0;
}

export function buildOwnerGroupsForChallengeForm(
  groupRows: ReadonlyArray<OwnerGroupRow>,
  challengeRows: ReadonlyArray<GroupChallengeRow>,
): OwnerGroupForChallengeForm[] {
  const latestChallengeByGroup = new Map<string, string>();
  const openChallengeByGroup = new Map<string, { id: string; createdAt: string }>();

  for (const challenge of challengeRows) {
    const currentLatest = latestChallengeByGroup.get(challenge.group_id);
    if (!currentLatest || challenge.created_at.localeCompare(currentLatest) > 0) {
      latestChallengeByGroup.set(challenge.group_id, challenge.created_at);
    }

    if (OPEN_STATUSES.has(challenge.status)) {
      const currentOpen = openChallengeByGroup.get(challenge.group_id);
      if (!currentOpen || challenge.created_at.localeCompare(currentOpen.createdAt) > 0) {
        openChallengeByGroup.set(challenge.group_id, {
          id: challenge.id,
          createdAt: challenge.created_at,
        });
      }
    }
  }

  return groupRows
    .map((group) => ({
      id: group.id,
      name: group.name,
      createdAt: group.created_at,
      latestChallengeCreatedAt: latestChallengeByGroup.get(group.id) ?? null,
      openChallengeId: openChallengeByGroup.get(group.id)?.id ?? null,
    }))
    .sort((a, b) => {
      const recentChallenge = compareIsoDesc(
        a.latestChallengeCreatedAt,
        b.latestChallengeCreatedAt,
      );
      if (recentChallenge !== 0) return recentChallenge;
      return compareIsoDesc(a.createdAt, b.createdAt);
    });
}

export async function readOwnerGroupsForChallengeForm(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<OwnerGroupsReadResult> {
  const { data: groupRows, error: groupError } = await supabase
    .from("groups")
    .select("id, name, created_at")
    .eq("owner_id", ownerId)
    .is("disbanded_at", null);

  if (groupError || !groupRows) {
    return { ok: false, groups: [], error: groupError };
  }

  const typedGroups = groupRows as OwnerGroupRow[];
  if (typedGroups.length === 0) return { ok: true, groups: [] };

  const groupIds = typedGroups.map((group) => group.id);
  const { data: challengeRows, error: challengeError } = await supabase
    .from("challenges")
    .select("id, group_id, status, created_at")
    .in("group_id", groupIds)
    .order("created_at", { ascending: false });

  if (challengeError || !challengeRows) {
    return { ok: false, groups: [], error: challengeError };
  }

  return {
    ok: true,
    groups: buildOwnerGroupsForChallengeForm(typedGroups, challengeRows as GroupChallengeRow[]),
  };
}

export async function fetchOwnerGroupsForChallengeForm(
  ownerId: string,
): Promise<OwnerGroupForChallengeForm[]> {
  const supabase = await createClient();
  const result = await readOwnerGroupsForChallengeForm(supabase, ownerId);
  return result.ok ? result.groups : [];
}

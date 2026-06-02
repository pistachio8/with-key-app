import { cacheLife, cacheTag } from "next/cache";
import { getAuthedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export type GroupMemberView = {
  id: string;
  displayName: string;
  role: "owner" | "member";
  joinedAt: string;
};

export type GroupChallengeRow = {
  id: string;
  title: string;
  status: "pending" | "accepted" | "active" | "closed";
  startAt: string | null;
  endAt: string | null;
};

export type GroupDetailView = {
  id: string;
  name: string | null;
  ownerId: string;
  bankCode: string | null;
  accountHolder: string | null;
  accountNumberLast4: string | null;
  members: GroupMemberView[];
  challenges: GroupChallengeRow[];
};

// RLS(`groups_select_member` / `gm_select_member` / `challenges_select_member`) 가
// 비멤버 차단. account_number_encrypted 평문은 본 read 에 포함되지 않음 (D-016).
//
// Phase 5-3: viewer-keyed primary tag + group-keyed secondary tag. owner 본인 mutation 은
// `updateTag('user-${uid}-group-${gid}')` 로 즉시 fresh, 타 멤버는 `revalidateTag('group-${gid}','max')`
// 로 SWR. ADR-0021 inline directive 패턴.
async function fetchGroupDetailInner(
  groupId: string,
  viewerId: string,
): Promise<GroupDetailView | null> {
  "use cache: private";
  cacheTag(`user-${viewerId}-group-${groupId}`, `group-${groupId}`);
  cacheLife("minutes");

  const supabase = await createClient();
  const { data: g, error } = await supabase
    .from("groups")
    .select("id, name, owner_id, bank_code, account_holder, account_number_last4")
    .eq("id", groupId)
    .is("disbanded_at", null)
    .maybeSingle();
  if (error || !g) return null;

  const { data: gms } = await supabase
    .from("group_members")
    .select("user_id, role, joined_at, users!inner(display_name)")
    .eq("group_id", groupId);

  const members: GroupMemberView[] = (gms ?? []).map((m) => {
    const u = Array.isArray(m.users) ? m.users[0] : m.users;
    return {
      id: m.user_id as string,
      displayName: u?.display_name ?? "익명",
      role: (m.role as "owner" | "member") ?? "member",
      joinedAt: m.joined_at as string,
    };
  });

  const { data: chs } = await supabase
    .from("challenges")
    .select("id, title, status, start_at, end_at, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  const challenges: GroupChallengeRow[] = (chs ?? []).map((c) => ({
    id: c.id as string,
    title: c.title as string,
    status: c.status as GroupChallengeRow["status"],
    startAt: c.start_at as string | null,
    endAt: c.end_at as string | null,
  }));

  return {
    id: g.id as string,
    name: g.name as string | null,
    ownerId: g.owner_id as string,
    bankCode: g.bank_code as string | null,
    accountHolder: g.account_holder as string | null,
    accountNumberLast4: g.account_number_last4 as string | null,
    members,
    challenges,
  };
}

// Phase 5 hotfix: 직접 `supabase.auth.getUser()` 대신 React `cache()` 로 dedupe 되는
// `getAuthedUser()` 사용 — 같은 request scope 의 다른 호출들과 auth.getUser 호출 통합.
// Supabase Auth 의 `over_request_rate_limit` (429) 압력 감소.
export async function fetchGroupDetail(groupId: string): Promise<GroupDetailView | null> {
  const { user } = await getAuthedUser();
  if (!user) return null;
  return fetchGroupDetailInner(groupId, user.id);
}

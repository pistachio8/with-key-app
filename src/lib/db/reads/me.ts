import "server-only";
import { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function fetchMyDisplayName(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data.display_name;
}

/**
 * 본 사용자가 owner 인 그룹의 `challenges` 테이블에 row 가 1건 이상
 * 현재 시점에 존재하면 true. status 필터 없음(pending/accepted/active/closed 모두 카운트).
 *
 * 알려진 false negative: `deleteChallenge` 로 row 가 hard delete 된 경우 false.
 * 자세한 트레이드오프는 spec §Design "C1 — Known False Negatives" 참조.
 *
 * supabase 에러 시 false (fail-safe — 신규 사용자 카피로 떨어짐).
 */
export async function readHasEverCreatedChallenge(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data: ownedGroups, error: groupsErr } = await supabase
    .from("groups")
    .select("id")
    .eq("owner_id", userId);

  if (groupsErr) return false;
  if (!ownedGroups || ownedGroups.length === 0) return false;

  const { data: anyChallenge, error: chErr } = await supabase
    .from("challenges")
    .select("id")
    .in(
      "group_id",
      (ownedGroups as { id: string }[]).map((g) => g.id),
    )
    .limit(1);

  if (chErr) return false;
  return (anyChallenge?.length ?? 0) > 0;
}

export async function hasEverCreatedChallenge(userId: string): Promise<boolean> {
  const supabase = await createClient();
  return readHasEverCreatedChallenge(supabase, userId);
}

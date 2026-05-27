import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Phase 5-1: display_name 은 mutation 빈도 ↓ + 라이프 ↑ — 명시 invalidation 생략.
// inline directive 강제 (ADR-0021) — closure 캡처 회피.
async function fetchMyDisplayNameInner(userId: string): Promise<string | null> {
  "use cache: private";
  cacheTag(`user-${userId}-display-name`);
  cacheLife("hours");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data.display_name;
}

export async function fetchMyDisplayName(userId: string): Promise<string | null> {
  return fetchMyDisplayNameInner(userId);
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

// Phase 5-1: empty-state CTA 카피용. mutation 빈도 매우 낮음 — 라이프 days.
async function hasEverCreatedChallengeInner(userId: string): Promise<boolean> {
  "use cache: private";
  cacheTag(`user-${userId}-has-created`);
  cacheLife("days");

  const supabase = await createClient();
  return readHasEverCreatedChallenge(supabase, userId);
}

export async function hasEverCreatedChallenge(userId: string): Promise<boolean> {
  return hasEverCreatedChallengeInner(userId);
}

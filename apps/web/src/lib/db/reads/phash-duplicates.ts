import "server-only";
// phash 중복 조회(그룹/전역) — AC-cheat-detect-1 ① 재탕 검출의 "입력"을 제공한다.
// θ(해밍 6/10)·scope 행동(same_user/same_group→failed, global→manual_review)은 EVAL-0022 가 적용.
// 여기서는 후보 prior phash 를 모아 거리·최근접·정확중복(findPhashDuplicates)만 돌려준다.
//
// adminClient(service_role) 사용 이유: 부정탐지 dedup 은 그룹 cross-user·전역까지 대조해야 하는
//   서버 전용 판단이라 viewer RLS 경계로는 부족하다. user-facing cache 에 저장하지 않는다(ADR-0024 가드).
import { adminClient } from "@/lib/supabase/admin";
import { findPhashDuplicates, type PhashCandidate, type PhashDuplicateResult } from "@/lib/verify";

export type PhashDedupScope =
  | { kind: "group"; groupId: string; excludeActionLogId?: string }
  | { kind: "global"; excludeActionLogId?: string };

// photo_phash 는 0045 신규 컬럼이라 생성 DB 타입(supabase.ts)에 아직 미반영(db:types 는 머지 후 --linked).
// untyped adminClient 결과를 명시 shape 로 좁혀 any 전파를 막는다(point-balance.ts 패턴).
type PhashRow = { id: string; user_id: string; photo_phash: string | null; challenge_id: string };

async function fetchCandidates(scope: PhashDedupScope): Promise<PhashCandidate[]> {
  const supabase = adminClient();

  let challengeIds: string[] | null = null;
  if (scope.kind === "group") {
    const { data: chs, error: chErr } = await supabase
      .from("challenges")
      .select("id")
      .eq("group_id", scope.groupId);
    if (chErr) throw chErr;
    challengeIds = ((chs ?? []) as Array<{ id: string }>).map((c) => c.id);
    if (challengeIds.length === 0) return [];
  }

  let query = supabase
    .from("action_logs")
    .select("id, user_id, photo_phash, challenge_id")
    .not("photo_phash", "is", null);
  if (challengeIds) query = query.in("challenge_id", challengeIds);

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as PhashRow[])
    .filter((r) => r.photo_phash != null && r.id !== scope.excludeActionLogId)
    .map((r) => ({ actionLogId: r.id, userId: r.user_id, phash: r.photo_phash as string }));
}

/** target phash 의 그룹/전역 중복 후보를 조회해 거리·최근접·정확중복을 돌려준다. */
export async function findActionLogPhashDuplicates(
  targetPhash: string,
  scope: PhashDedupScope,
): Promise<PhashDuplicateResult> {
  const candidates = await fetchCandidates(scope);
  return findPhashDuplicates(targetPhash, candidates);
}

// 벌칙 창2 read service (spec 2026-06-29 §C2 · ADR-0036/0037).
// - fetchPenaltyStatus: admin hydrate read 라 BFF `GET /api/penalty-status`(Bearer) 단일 endpoint.
// - fetchPenaltyWaiting: 순수 RLS read(home 진입로)라 supabase 직접 (web penalty-waiting.ts 미러).
import {
  penaltyStatusViewSchema,
  type PenaltyStatusView,
  type PenaltyWaitingView,
} from "@withkey/domain";

import { bffGetJson, BffRequestError } from "@/services/api/bff-client";
import { getSupabaseClient } from "@/services/supabase/client";

// 창2 = [종료+48h, 종료+96h] (web penalty-status.ts·penalty-waiting.ts 상수 정합).
const WINDOW_OPEN_MS = 48 * 60 * 60 * 1000;
const WINDOW_CLOSE_MS = 96 * 60 * 60 * 1000;

/** 벌칙 창2 상태 — BFF(Bearer + admin hydrate). 404(벌칙 미션 없음/접근 불가)는 null. 계약 위반은 throw. */
export async function fetchPenaltyStatus(challengeId: string): Promise<PenaltyStatusView | null> {
  try {
    const json = await bffGetJson(
      `/api/penalty-status?challengeId=${encodeURIComponent(challengeId)}`,
    );
    return penaltyStatusViewSchema.parse(json);
  } catch (err) {
    if (err instanceof BffRequestError && err.status === 404) return null;
    throw err;
  }
}

type WaitingChallengeRow = {
  id: string;
  title: string;
  group_id: string;
  penalty_amount: number;
  penalty_mission: string | null;
  end_at: string | null;
  closed_at: string | null;
};

/** home "만회 찬스 대기" — 순수 RLS 직접 read(admin hydrate 아님). web fetchPenaltyWaitingInner 미러. */
export async function fetchPenaltyWaiting(
  viewerId: string,
  options: { now?: Date } = {},
): Promise<PenaltyWaitingView[]> {
  const supabase = getSupabaseClient();
  const now = (options.now ?? new Date()).getTime();

  // RLS(groups_select_member)가 viewer 그룹만 통과.
  const { data: groups } = await supabase
    .from("groups")
    .select("id, name")
    .is("disbanded_at", null);
  if (!groups || groups.length === 0) return [];
  const nameByGroup = new Map<string, string | null>(
    groups.map((g) => [g.id as string, (g.name as string | null) ?? null]),
  );

  // closed + penalty_mission 있는 챌린지(RLS: 그룹 멤버만). 창2 게이트는 메모리.
  const { data: challenges } = await supabase
    .from("challenges")
    .select("id, title, group_id, penalty_amount, penalty_mission, end_at, closed_at")
    .in("group_id", [...nameByGroup.keys()])
    .eq("status", "closed")
    .not("penalty_mission", "is", null);
  if (!challenges || challenges.length === 0) return [];

  const open = (challenges as unknown as WaitingChallengeRow[]).filter((c) => {
    const endAt = c.closed_at ?? c.end_at;
    if (!endAt) return false;
    const end = new Date(endAt).getTime();
    return now >= end + WINDOW_OPEN_MS && now <= end + WINDOW_CLOSE_MS;
  });
  if (open.length === 0) return [];

  // viewer 가 서약 참가자인 챌린지만.
  const { data: parts } = await supabase
    .from("challenge_participants")
    .select("challenge_id")
    .eq("user_id", viewerId)
    .not("signed_at", "is", null)
    .in(
      "challenge_id",
      open.map((c) => c.id),
    );
  const mySignedIds = new Set((parts ?? []).map((p) => p.challenge_id as string));

  return open
    .filter((c) => mySignedIds.has(c.id))
    .map((c) => ({
      challengeId: c.id,
      title: c.title,
      groupName: nameByGroup.get(c.group_id) ?? null,
      penaltyAmount: c.penalty_amount,
    }));
}

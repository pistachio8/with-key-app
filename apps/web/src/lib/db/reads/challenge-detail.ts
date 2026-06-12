import { cache } from "react";
import {
  toKstDayKey,
  dayIndexOf,
  challengePhase,
  countDoneDaysByUserByWeek,
  computeAccruedPot,
  type CutoffContext,
  type CutoffPhase,
  type ChallengeMemberView as ChallengeMemberContract,
  type ChallengeDetailView as ChallengeDetailContract,
  type ChallengeGroupView,
} from "@withkey/domain";
import { createClient } from "@/lib/supabase/server";

// view-model 계약 SoT 는 @withkey/domain read-contracts (EVAL-0016 · ADR-0037).
// web 은 계약 위에 서버 전용 doneByWeek(Map — JSON 직렬화 불가라 RN 계약 제외)만 확장한다.
export type { ChallengeGroupView };

export type ChallengeMemberView = ChallengeMemberContract & {
  // 주차별 done (week → distinct day count). dashboard H3 viewer 칩·링 계산용 (서버 전용).
  doneByWeek: ReadonlyMap<number, number>;
};

export type ChallengeDetailView = Omit<ChallengeDetailContract, "members"> & {
  members: ChallengeMemberView[];
};

export const fetchChallengeDetail = cache(
  async (challengeId: string): Promise<ChallengeDetailView | null> => {
    const supabase = await createClient();
    // D-016: groups 계좌 필드는 마스킹·표시용 3개만 SELECT. 암호문(account_number_encrypted)
    // 은 revealAccountNumber Server Action 한 경로로만 조회.
    const { data: c, error } = await supabase
      .from("challenges")
      .select(
        "id, title, goal_count, duration_days, penalty_amount, status, start_at, end_at, closed_at, group_id, groups!inner(id, owner_id, bank_code, account_holder, account_number_last4)",
      )
      .eq("id", challengeId)
      .maybeSingle();
    // error 와 "row 없음" 을 같은 null 로 fold 하면 페이지가 notFound() → 404 로
    // 처리해 실제 원인(429 카스케이드 · 권한/스키마 drift · 네트워크)이 stack
    // 없이 사라진다. error 는 throw 로 surface 시키고, 진짜 "row 없음" 만 null.
    if (error) {
      console.error("[fetchChallengeDetail] supabase error", { challengeId, error });
      throw new Error(`fetchChallengeDetail(${challengeId}) failed: ${error.message}`);
    }
    if (!c) return null;

    const groupRow = Array.isArray(c.groups) ? c.groups[0] : c.groups;

    const { data: parts } = await supabase
      .from("challenge_participants")
      .select("user_id, signed_at, users!inner(display_name)")
      .eq("challenge_id", challengeId);

    const { data: logs } = await supabase
      .from("action_logs")
      .select("user_id, created_at")
      .eq("challenge_id", challengeId);
    const status = c.status as ChallengeDetailView["status"];
    const startKey = c.start_at ? toKstDayKey(c.start_at) : null;
    // 하루 N개 피드도 인증은 1회 → KST distinct day → 주차 버킷. startKey 없으면(미시작) 빈 집계.
    const byUserByWeek = startKey
      ? countDoneDaysByUserByWeek(logs ?? [], startKey, c.duration_days)
      : new Map<string, Map<number, number>>();

    const members: ChallengeMemberView[] = (parts ?? []).map((p) => {
      const u = Array.isArray(p.users) ? p.users[0] : p.users;
      const doneByWeek = byUserByWeek.get(p.user_id) ?? new Map<number, number>();
      // doneCount = 전체 distinct day (주차 합). 멤버 strip 표시용 — 기존 의미 유지.
      let doneCount = 0;
      for (const n of doneByWeek.values()) doneCount += n;
      return {
        id: p.user_id,
        displayName: u?.display_name ?? "익명",
        doneCount,
        signed: p.signed_at != null,
        doneByWeek,
      };
    });

    // 시간 의존: render 시점 now 1회. React cache() 라 요청마다 새로 실행 → stale 없음.
    const now = new Date();
    const phase = challengePhase(status, c.end_at, now.getTime());
    // 주차 인덱싱이 가능한(시작된) 챌린지만 confirmed 합산. pending/accepted(start_at null)은 0.
    const settleable = phase === "running" || phase === "over" || phase === "closed";
    const potTotal =
      settleable && startKey
        ? computeAccruedPot(
            members.map((m) => ({ doneByWeek: m.doneByWeek })),
            {
              phase: phase as CutoffPhase,
              durationDays: c.duration_days,
              todayDayIndex: dayIndexOf(toKstDayKey(now), startKey),
              closedAt: c.closed_at ?? null,
              startKey,
            } satisfies CutoffContext,
            { goalCount: c.goal_count, penaltyAmount: c.penalty_amount },
          )
        : 0;

    return {
      id: c.id,
      title: c.title,
      goalCount: c.goal_count,
      durationDays: c.duration_days,
      penaltyAmount: c.penalty_amount,
      status,
      startAt: c.start_at,
      endAt: c.end_at,
      closedAt: c.closed_at ?? null,
      members,
      // 끝난 주 기준 per-head 합(단조). 미시작은 0. (spec C4)
      potTotal,
      participantCount: members.length,
      group: {
        id: groupRow?.id ?? c.group_id,
        ownerId: groupRow?.owner_id ?? "",
        bankCode: groupRow?.bank_code ?? null,
        accountHolder: groupRow?.account_holder ?? null,
        accountNumberLast4: groupRow?.account_number_last4 ?? null,
      },
    };
  },
);

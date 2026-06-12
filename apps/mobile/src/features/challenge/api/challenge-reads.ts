// 챌린지 read service — RN-safe(RLS) Supabase 직접 read (00 §13.3 · ADR-0037).
// 추출 소스: apps/web/src/lib/db/reads/{current-challenges,challenge-detail,my-challenges,pledge}.ts.
// web 의 `use cache`/cookie 의존은 제거 — RN 캐싱은 TanStack Query(keys.ts) 가 담당한다.
// 도메인 계산(phase·주차 버킷·누적금)은 @withkey/domain 소비(재구현 금지) — view 조립만 여기서.
// 보존 eval: evals/fixtures/read-contracts/* 스냅샷이 web read 와의 일치를 강제한다.
import {
  toKstDayKey,
  dayIndexOf,
  challengePhase,
  remainingDays,
  weekBucketsFromDayKeys,
  countDoneDaysByUserByWeek,
  computeAccruedPot,
  confirmedPenalty,
  type ChallengeStatus,
  type CutoffContext,
  type CutoffPhase,
  type GroupChallengeView,
  type ChallengeDetailView,
  type ChallengeMemberView,
  type MyChallengeItem,
  type MyChallenges,
  type PledgeView,
} from "@withkey/domain";

import { getSupabaseClient } from "@/services/supabase/client";

const DEFAULT_CURRENT_STATUSES = [
  "pending",
  "accepted",
  "active",
] as const satisfies readonly ChallengeStatus[];

type GroupRow = {
  id: string;
  name: string | null;
  bank_code: string | null;
  account_holder: string | null;
  account_number_last4: string | null;
};

type ChallengeRow = {
  id: string;
  group_id: string;
  title: string;
  goal_count: number;
  duration_days: number;
  penalty_amount: number;
  status: ChallengeStatus;
  start_at: string | null;
  end_at: string | null;
  closed_at: string | null;
  created_at: string;
};

/**
 * 내가 속한 모든 그룹 × 각 그룹의 "가장 최근 pending/accepted/active 챌린지" 1개.
 * 챌린지가 없는 그룹은 `challenge: null`. RLS(`groups`/`challenges`/`group_members`)가
 * 비멤버 필터링 담당 — viewer 토큰 client 전제.
 */
export async function fetchCurrentChallenges(userId: string): Promise<GroupChallengeView[]> {
  const supabase = getSupabaseClient();

  const { data: groups, error: groupsErr } = await supabase
    .from("groups")
    .select("id, name, bank_code, account_holder, account_number_last4")
    .is("disbanded_at", null)
    .order("created_at", { ascending: false });

  if (groupsErr || !groups) return [];
  const groupRows = groups as unknown as GroupRow[];
  if (groupRows.length === 0) return [];

  const groupIds = groupRows.map((g) => g.id);
  const { data: challenges } = await supabase
    .from("challenges")
    .select(
      "id, group_id, title, goal_count, duration_days, penalty_amount, status, start_at, end_at, closed_at, created_at",
    )
    .in("group_id", groupIds)
    .in("status", [...DEFAULT_CURRENT_STATUSES])
    .order("created_at", { ascending: false });

  const latestByGroup = new Map<string, ChallengeRow>();
  for (const c of (challenges ?? []) as unknown as ChallengeRow[]) {
    if (!latestByGroup.has(c.group_id)) latestByGroup.set(c.group_id, c);
  }

  const challengeIds = Array.from(latestByGroup.values()).map((c) => c.id);
  if (challengeIds.length === 0) {
    return groupRows.map((g) => ({
      groupId: g.id,
      groupName: g.name,
      bankCode: g.bank_code,
      accountHolder: g.account_holder,
      accountNumberLast4: g.account_number_last4,
      challenge: null,
    }));
  }

  // 하루 N개 피드도 인증은 1회 — KST 자정 기준 distinct day count.
  // potTotal(누적금)은 미달자 판정을 위해 전체 참가자 로그가 필요(RLS al_select_member).
  const dayKeysByChallengeUser = new Map<string, Map<string, Set<string>>>();
  const todayKstKey = toKstDayKey(new Date());
  const { data: allLogs } = await supabase
    .from("action_logs")
    .select("challenge_id, user_id, created_at")
    .in("challenge_id", challengeIds);
  for (const row of allLogs ?? []) {
    const r = row as { challenge_id: string; user_id: string; created_at: string };
    let byUser = dayKeysByChallengeUser.get(r.challenge_id);
    if (!byUser) {
      byUser = new Map<string, Set<string>>();
      dayKeysByChallengeUser.set(r.challenge_id, byUser);
    }
    let s = byUser.get(r.user_id);
    if (!s) {
      s = new Set<string>();
      byUser.set(r.user_id, s);
    }
    s.add(toKstDayKey(r.created_at));
  }

  const participantIdsByChallenge = new Map<string, string[]>();
  const myParticipantChallengeIds = new Set<string>();
  const { data: parts } = await supabase
    .from("challenge_participants")
    .select("challenge_id, user_id")
    .in("challenge_id", challengeIds);
  for (const row of parts ?? []) {
    const r = row as { challenge_id: string; user_id: string };
    const id = r.challenge_id;
    const list = participantIdsByChallenge.get(id);
    if (list) list.push(r.user_id);
    else participantIdsByChallenge.set(id, [r.user_id]);
    if (r.user_id === userId) myParticipantChallengeIds.add(id);
  }

  return groupRows.map((g) => {
    const c = latestByGroup.get(g.id);
    if (!c) {
      return {
        groupId: g.id,
        groupName: g.name,
        bankCode: g.bank_code,
        accountHolder: g.account_holder,
        accountNumberLast4: g.account_number_last4,
        challenge: null,
      };
    }
    const phase = challengePhase(c.status, c.end_at);
    // daysLeft 는 running 일 때만 D-N 으로 렌더된다(ADR-0027). 미시작은 duration_days 폴백.
    const daysLeft = c.end_at ? remainingDays(c.end_at) : c.duration_days;
    const participantIds = participantIdsByChallenge.get(c.id) ?? [];
    const daysByUser = dayKeysByChallengeUser.get(c.id);
    const myDayKeys = daysByUser?.get(userId);

    // 주 단위 누적 — 끝난 주만 합산(spec C3·C4). 시작된 챌린지만.
    const startKey = c.start_at ? toKstDayKey(c.start_at) : null;
    const settleable = phase === "running" || phase === "over" || phase === "closed";
    let potTotal = 0;
    let myConfirmedPenalty = 0;
    if (settleable && startKey) {
      const ctx: CutoffContext = {
        phase: phase as CutoffPhase,
        durationDays: c.duration_days,
        todayDayIndex: dayIndexOf(todayKstKey, startKey),
        closedAt: c.closed_at ?? null,
        startKey,
      };
      const params = { goalCount: c.goal_count, penaltyAmount: c.penalty_amount };
      potTotal = computeAccruedPot(
        participantIds.map((uid) => ({
          doneByWeek: weekBucketsFromDayKeys(daysByUser?.get(uid) ?? [], startKey, c.duration_days),
        })),
        ctx,
        params,
      );
      myConfirmedPenalty = confirmedPenalty(
        weekBucketsFromDayKeys(myDayKeys ?? [], startKey, c.duration_days),
        ctx,
        params,
      );
    }

    return {
      groupId: g.id,
      groupName: g.name,
      bankCode: g.bank_code,
      accountHolder: g.account_holder,
      accountNumberLast4: g.account_number_last4,
      challenge: {
        id: c.id,
        title: c.title,
        goalCount: c.goal_count,
        durationDays: c.duration_days,
        penaltyAmount: c.penalty_amount,
        status: c.status,
        phase,
        startAt: c.start_at,
        endAt: c.end_at,
        doneCount: myDayKeys?.size ?? 0,
        daysLeft,
        potTotal,
        myConfirmedPenalty,
        participantCount: participantIds.length,
        userIsParticipant: myParticipantChallengeIds.has(c.id),
        verifiedToday: myDayKeys?.has(todayKstKey) ?? false,
      },
    };
  });
}

/**
 * 챌린지 상세 — RN 계약(ChallengeDetailView)만 반환한다. web 의 서버 전용
 * doneByWeek(Map)는 노출하지 않고 potTotal 계산에만 내부 사용 (ADR-0037).
 */
export async function fetchChallengeDetail(
  challengeId: string,
): Promise<ChallengeDetailView | null> {
  const supabase = getSupabaseClient();
  // D-016: groups 계좌 필드는 마스킹·표시용 3개만 SELECT.
  const { data: c, error } = await supabase
    .from("challenges")
    .select(
      "id, title, goal_count, duration_days, penalty_amount, status, start_at, end_at, closed_at, group_id, groups!inner(id, owner_id, bank_code, account_holder, account_number_last4)",
    )
    .eq("id", challengeId)
    .maybeSingle();
  // error 와 "row 없음"을 fold 하지 않는다 — error 는 throw, 진짜 row 없음만 null (web 과 동일).
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

  const status = c.status as ChallengeStatus;
  const startKey = c.start_at ? toKstDayKey(c.start_at) : null;
  // 하루 N개 피드도 인증은 1회 → KST distinct day → 주차 버킷. startKey 없으면 빈 집계.
  const byUserByWeek = startKey
    ? countDoneDaysByUserByWeek(logs ?? [], startKey, c.duration_days)
    : new Map<string, Map<number, number>>();

  const memberRows = (parts ?? []).map((p) => {
    const u = Array.isArray(p.users) ? p.users[0] : p.users;
    const doneByWeek = byUserByWeek.get(p.user_id) ?? new Map<number, number>();
    let doneCount = 0;
    for (const n of doneByWeek.values()) doneCount += n;
    return {
      member: {
        id: p.user_id as string,
        displayName: (u?.display_name as string | null) ?? "익명",
        doneCount,
        signed: p.signed_at != null,
      } satisfies ChallengeMemberView,
      doneByWeek,
    };
  });
  const members = memberRows.map((m) => m.member);

  const now = new Date();
  const phase = challengePhase(status, c.end_at, now.getTime());
  const settleable = phase === "running" || phase === "over" || phase === "closed";
  const potTotal =
    settleable && startKey
      ? computeAccruedPot(
          memberRows.map((m) => ({ doneByWeek: m.doneByWeek })),
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
    id: c.id as string,
    title: c.title as string,
    goalCount: c.goal_count as number,
    durationDays: c.duration_days as number,
    penaltyAmount: c.penalty_amount as number,
    status,
    startAt: c.start_at as string | null,
    endAt: c.end_at as string | null,
    closedAt: (c.closed_at as string | null) ?? null,
    members,
    potTotal,
    participantCount: members.length,
    group: {
      id: (groupRow?.id as string) ?? (c.group_id as string),
      ownerId: (groupRow?.owner_id as string) ?? "",
      bankCode: (groupRow?.bank_code as string | null) ?? null,
      accountHolder: (groupRow?.account_holder as string | null) ?? null,
      accountNumberLast4: (groupRow?.account_number_last4 as string | null) ?? null,
    },
  };
}

/** /me 챌린지 목록 — 운영(owner)/참여(member) 분리, status rank 정렬 (web 과 동일). */
export async function fetchMyChallenges(userId: string): Promise<MyChallenges> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("challenge_participants")
    .select(
      "challenge_id, challenges!inner(id, title, status, start_at, end_at, group_id, groups!inner(owner_id))",
    )
    .eq("user_id", userId);

  if (error || !data) return { owner: [], member: [] };

  const owner: MyChallengeItem[] = [];
  const member: MyChallengeItem[] = [];
  for (const row of data) {
    const c = Array.isArray(row.challenges) ? row.challenges[0] : row.challenges;
    if (!c) continue;
    const g = Array.isArray(c.groups) ? c.groups[0] : c.groups;
    const ownerId = (g?.owner_id as string) ?? "";
    const item: MyChallengeItem = {
      id: c.id as string,
      title: c.title as string,
      status: c.status as ChallengeStatus,
      startAt: (c.start_at as string | null) ?? null,
      endAt: (c.end_at as string | null) ?? null,
      ownerId,
    };
    if (ownerId === userId) owner.push(item);
    else member.push(item);
  }
  // active > accepted > pending > closed 순.
  const rank: Record<ChallengeStatus, number> = {
    active: 0,
    accepted: 1,
    pending: 2,
    closed: 3,
  };
  const byStatus = (a: MyChallengeItem, b: MyChallengeItem) => rank[a.status] - rank[b.status];
  owner.sort(byStatus);
  member.sort(byStatus);
  return { owner, member };
}

/** 서명 대기(pending/accepted) 서약 뷰. challengeId 미지정 시 내 첫 대기 건. */
export async function fetchPendingPledge(
  userId: string,
  challengeId?: string,
): Promise<PledgeView | null> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from("challenge_participants")
    .select(
      "challenge_id, challenges!inner(id, title, goal_count, duration_days, penalty_amount, status)",
    )
    .eq("user_id", userId)
    .in("challenges.status", ["pending", "accepted"]);
  if (challengeId) {
    query = query.eq("challenge_id", challengeId);
  }
  const { data: self } = await query.limit(1).maybeSingle();

  if (!self) return null;
  const c = Array.isArray(self.challenges) ? self.challenges[0] : self.challenges;
  if (!c) return null;

  const { data: allParts } = await supabase
    .from("challenge_participants")
    .select("user_id, signed_at, users!inner(display_name)")
    .eq("challenge_id", c.id);

  const members = (allParts ?? []).map((p) => {
    const u = Array.isArray(p.users) ? p.users[0] : p.users;
    return {
      id: p.user_id as string,
      displayName: (u?.display_name as string | null) ?? "익명",
      signed: p.signed_at != null,
    };
  });
  const mySigned = members.find((m) => m.id === userId)?.signed ?? false;

  return {
    id: c.id as string,
    title: c.title as string,
    goalCount: c.goal_count as number,
    durationDays: c.duration_days as number,
    penaltyAmount: c.penalty_amount as number,
    members,
    mySigned,
  };
}

import { cacheLife, cacheTag } from "next/cache";
import { toKstDayKey } from "@/lib/challenge/done-days";
import {
  challengePhase,
  remainingDays,
  type ChallengePhase,
  type ChallengeStatus,
} from "@/lib/challenge/lifecycle";
import { computeAccruedPot } from "@/lib/challenge/settlement";
import { createClient } from "@/lib/supabase/server";

export type GroupChallengeView = {
  groupId: string;
  groupName: string | null;
  // D-016: 마스킹·표시용 필드만 RSC 까지 내려보냄.
  // `account_number_encrypted` 컬럼은 의도적으로 SELECT 화이트리스트에서 제외 —
  // 평문 복호화는 `revealAccountNumber` Server Action 한 경로로만.
  bankCode: string | null;
  accountHolder: string | null;
  accountNumberLast4: string | null;
  challenge: {
    id: string;
    title: string;
    goalCount: number;
    durationDays: number;
    penaltyAmount: number;
    status: ChallengeStatus;
    // status + end_at 파생 phase (ADR-0027). 표시·자격 분기는 status 가 아니라 phase 로.
    phase: ChallengePhase;
    startAt: string | null;
    endAt: string | null;
    doneCount: number;
    daysLeft: number;
    potTotal: number;
    // 코호트 분리(솔로 1 / 그룹 ≥2) — PR-2.
    participantCount: number;
    // 그룹 멤버이지만 이미 시작된 챌린지 코호트에는 없을 수 있다.
    userIsParticipant: boolean;
    // 모킹업 §2-B 홈 stats/list — 오늘 본인 인증 여부. KST 자정 기준.
    verifiedToday: boolean;
  } | null;
};

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
  created_at: string;
};

/**
 * 내가 속한 모든 그룹 × 각 그룹의 "가장 최근 pending/accepted/active 챌린지" 1개.
 * 챌린지가 없는 그룹은 `challenge: null` (홈 스트립에서 "새 서약서" CTA 로 사용).
 * RLS(`groups` / `challenges` / `group_members`) 가 비멤버 필터링 담당.
 *
 * Phase 5-1: viewer-keyed private cache. mutation 경로(submitActionLog · join/leave 등)가
 * `updateTag('user-${uid}-home-feed')` 로 read-your-writes 보장.
 * ADR-0021 — closure 캡처 회피를 위해 inner 분리 + inline directive.
 */
async function fetchCurrentChallengesInner(userId: string): Promise<GroupChallengeView[]> {
  "use cache: private";
  cacheTag(`user-${userId}-home-feed`);
  cacheLife("minutes");

  const supabase = await createClient();

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
      "id, group_id, title, goal_count, duration_days, penalty_amount, status, start_at, end_at, created_at",
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
  // potTotal(누적금)은 미달자 판정을 위해 "참가자별" distinct day 가 필요하므로 본인 로그만이
  // 아니라 전체 참가자 로그를 조회한다(RLS al_select_member: 그룹 멤버면 SELECT 허용).
  // 본인 doneCount/verifiedToday 는 같은 조회에서 user_id === userId 로 파생.
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
        // 그 챌린지의 총 누적금 — 정보탭과 동일(computeAccruedPot). 미달자 기준 실제
        // 정산액 합계이며 "인원수 × 벌금"(최대값)이 아니다. 미시작(pending/accepted)은 0.
        potTotal: computeAccruedPot({
          status: c.status,
          goalCount: c.goal_count,
          penaltyAmount: c.penalty_amount,
          members: participantIds.map((uid) => ({ doneCount: daysByUser?.get(uid)?.size ?? 0 })),
        }),
        participantCount: participantIds.length,
        userIsParticipant: myParticipantChallengeIds.has(c.id),
        verifiedToday: myDayKeys?.has(todayKstKey) ?? false,
      },
    };
  });
}

export async function fetchCurrentChallenges(userId: string): Promise<GroupChallengeView[]> {
  return fetchCurrentChallengesInner(userId);
}

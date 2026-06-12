// 정산(recap) read service — RN-safe(RLS) Supabase 직접 read (00 §13.3 · ADR-0037).
// 추출 소스: apps/web/src/lib/db/reads/{recap,challenge-photos}.ts.
// view 조립은 @withkey/domain 계산 함수 합성 — 보존 eval(evals/fixtures/read-contracts/recap.ts)
// 스냅샷이 web buildRecapView 와의 일치를 강제한다.
import {
  toKstDayKey,
  countDoneDaysByUserByWeek,
  confirmedPenalty,
  achievedAllElapsedWeeks,
  doneInElapsedWeeks,
  countAchievedWeeks,
  elapsedWeeks,
  pickMvpIds,
  type CutoffContext,
  type RecapGroupView,
  type RecapMemberView,
  type RecapPhotoView,
  type RecapView,
} from "@withkey/domain";

import { getSupabaseClient } from "@/services/supabase/client";

type ChallengeRow = {
  id: string;
  title: string;
  goal_count: number;
  duration_days: number;
  penalty_amount: number;
  status: "active" | "closed";
  start_at: string | null;
  end_at: string | null;
  closed_at: string | null;
};

type ParticipantRow = {
  user_id: string;
  display_name: string | null;
  doneByWeek: Map<number, number>;
};

// web recap.ts buildRecapView 와 동일 조립 — 보존 스냅샷으로 drift 차단.
function buildRecapView(input: {
  challenge: ChallengeRow;
  participants: readonly ParticipantRow[];
  viewerId: string;
  group?: RecapGroupView | null;
}): RecapView {
  const { challenge, participants, viewerId } = input;
  // recap 진입 조건은 isChallengeOver — closed 또는 active+만기(over). running 미진입.
  const phase = challenge.status === "closed" ? "closed" : "over";
  const startKey = challenge.start_at ? toKstDayKey(challenge.start_at) : "";
  const ctx: CutoffContext = {
    phase,
    durationDays: challenge.duration_days,
    todayDayIndex: 0, // over/closed 는 today 비의존
    closedAt: challenge.closed_at,
    startKey,
  };
  const params = { goalCount: challenge.goal_count, penaltyAmount: challenge.penalty_amount };

  const mvpIds = pickMvpIds(
    participants.map((p) => ({ id: p.user_id, doneByWeek: p.doneByWeek })),
    ctx,
    { goalCount: challenge.goal_count },
  );

  const members: RecapMemberView[] = participants.map((p) => ({
    id: p.user_id,
    displayName: p.display_name ?? "익명",
    doneCount: doneInElapsedWeeks(p.doneByWeek, ctx),
    achieved: achievedAllElapsedWeeks(p.doneByWeek, ctx, { goalCount: challenge.goal_count }),
    isMvp: mvpIds.includes(p.user_id),
  }));

  const viewerPart = participants.find((p) => p.user_id === viewerId);
  const viewerDoneByWeek = viewerPart?.doneByWeek ?? new Map<number, number>();

  return {
    challengeId: challenge.id,
    title: challenge.title,
    goalCount: challenge.goal_count,
    durationDays: challenge.duration_days,
    penaltyAmount: challenge.penalty_amount,
    startAt: challenge.start_at,
    endAt: challenge.end_at,
    status: challenge.status,
    viewerId,
    viewerAchieved: achievedAllElapsedWeeks(viewerDoneByWeek, ctx, {
      goalCount: challenge.goal_count,
    }),
    viewerDoneCount: doneInElapsedWeeks(viewerDoneByWeek, ctx),
    viewerPerHeadPenalty: confirmedPenalty(viewerDoneByWeek, ctx, params),
    viewerElapsedWeeks: elapsedWeeks(ctx).length,
    viewerAchievedWeeks: countAchievedWeeks(viewerDoneByWeek, ctx, {
      goalCount: challenge.goal_count,
    }),
    group: input.group ?? null,
    members,
    anyoneAchieved: members.some((m) => m.achieved),
  };
}

type FetchRecapOptions = { now?: Date; challengeId?: string };

/**
 * 끝났거나 만기 지난 가장 최근 챌린지 1개의 정산 뷰 (challengeId 지정 시 그 건만).
 * RLS 가 챌린지/참가자/로그 접근을 자동 필터링.
 */
export async function fetchRecap(
  viewerId: string,
  options: FetchRecapOptions = {},
): Promise<RecapView | null> {
  const supabase = getSupabaseClient();
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();

  // canonical 판정은 isChallengeOver(@withkey/domain) — .or 는 그 SQL 미러 (web recap.ts 와 동일).
  let cq = supabase
    .from("challenges")
    .select(
      "id, title, goal_count, duration_days, penalty_amount, status, start_at, end_at, closed_at, groups!inner(id, name, owner_id, bank_code, account_holder, account_number_last4)",
    )
    .or(`status.eq.closed,and(status.eq.active,end_at.lte.${nowIso})`);
  if (options.challengeId) cq = cq.eq("id", options.challengeId);
  const { data: challenges, error } = await cq.order("end_at", { ascending: false }).limit(1);

  if (error || !challenges?.[0]) return null;
  const raw = challenges[0];
  const challenge: ChallengeRow = {
    id: raw.id as string,
    title: raw.title as string,
    goal_count: raw.goal_count as number,
    duration_days: raw.duration_days as number,
    penalty_amount: raw.penalty_amount as number,
    status: raw.status as ChallengeRow["status"],
    start_at: raw.start_at as string | null,
    end_at: raw.end_at as string | null,
    closed_at: raw.closed_at as string | null,
  };
  const groupRow = Array.isArray(raw.groups) ? raw.groups[0] : raw.groups;
  const group: RecapGroupView | null = groupRow
    ? {
        id: groupRow.id as string,
        name: (groupRow.name as string) ?? "",
        ownerId: groupRow.owner_id as string,
        bankCode: (groupRow.bank_code as string | null) ?? null,
        accountHolder: (groupRow.account_holder as string | null) ?? null,
        accountNumberLast4: (groupRow.account_number_last4 as string | null) ?? null,
      }
    : null;

  const { data: parts } = await supabase
    .from("challenge_participants")
    .select("user_id, users!inner(display_name)")
    .eq("challenge_id", challenge.id);

  const { data: logs } = await supabase
    .from("action_logs")
    .select("user_id, created_at")
    .eq("challenge_id", challenge.id);

  // 하루 N개 피드도 인증은 1회 → KST distinct day → 주차 버킷. start_at 없으면 빈 집계.
  const startKey = challenge.start_at ? toKstDayKey(challenge.start_at) : null;
  const byUserByWeek = startKey
    ? countDoneDaysByUserByWeek(logs ?? [], startKey, challenge.duration_days)
    : new Map<string, Map<number, number>>();

  const participants: ParticipantRow[] = (parts ?? []).map((p) => {
    const u = Array.isArray(p.users) ? p.users[0] : p.users;
    return {
      user_id: p.user_id as string,
      display_name: (u?.display_name as string | null) ?? null,
      doneByWeek: byUserByWeek.get(p.user_id) ?? new Map<number, number>(),
    };
  });

  return buildRecapView({ challenge, participants, viewerId, group });
}

const PHOTO_BUCKET = "action-photos";
// web lib/storage/action-photos.ts 와 동일 TTL. signed URL 수명 정책 변경(ADR-0036 §3,
// feed 경로 900s)은 후속 task — recap 그리드는 web getPhotoSignedUrls(600s)와 정합 유지.
const PHOTO_SIGNED_TTL_SECONDS = 600;
// web looksLikePhotoPath 와 동일 패턴 — photo_path 가 URL/이상값이면 signed URL 생성 제외.
const PHOTO_PATH_RE =
  /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+-[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/i;

type PhotoRow = {
  id: string;
  user_id: string;
  photo_path: string | null;
  created_at: string;
  users: { display_name: string | null } | { display_name: string | null }[];
};

/**
 * recap 사진 그리드 — viewer 토큰으로 직접 signed URL 생성.
 * 스토리지 RLS(`ap_select_group_member`)가 그룹 멤버만 허용 → 비멤버는 빈 배열.
 */
export async function fetchChallengePhotos(
  challengeId: string,
): Promise<readonly RecapPhotoView[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("action_logs")
    .select(
      // ADR-0017 — PostgREST embed 모호함(PGRST201) 회피 위해 작성자 FK 명시 (web 과 동일).
      [
        "id",
        "user_id",
        "photo_path",
        "created_at",
        "users!action_logs_user_id_fkey!inner(display_name)",
      ].join(","),
    )
    .eq("challenge_id", challengeId)
    .not("photo_path", "is", null)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  const rows = data as unknown as PhotoRow[];
  const validIndices: number[] = [];
  const validPaths: string[] = [];
  rows.forEach((row, index) => {
    const path = row.photo_path;
    if (path && !path.includes("://") && PHOTO_PATH_RE.test(path)) {
      validIndices.push(index);
      validPaths.push(path);
    }
  });

  const signedUrls: (string | null)[] = rows.map(() => null);
  if (validPaths.length > 0) {
    const { data: signed, error: signErr } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(validPaths, PHOTO_SIGNED_TTL_SECONDS);
    if (!signErr && signed) {
      signed.forEach((row, i) => {
        if (row?.signedUrl) signedUrls[validIndices[i]] = row.signedUrl;
      });
    }
  }

  const out: RecapPhotoView[] = [];
  rows.forEach((row, i) => {
    if (!row.photo_path) return;
    const url = signedUrls[i];
    if (!url) return;
    const author = Array.isArray(row.users) ? row.users[0] : row.users;
    out.push({
      id: row.id,
      signedUrl: url,
      takenAt: row.created_at,
      ownerDisplayName: author?.display_name ?? "익명",
      ownerId: row.user_id,
    });
  });
  return out;
}

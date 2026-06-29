import { cacheLife, cacheTag } from "next/cache";
import {
  toKstDayKey,
  dayIndexOf,
  challengePhase,
  confirmedPenalty,
  weekBucketsFromDayKeys,
  isPenaltyProofRejectedByPeers,
  type ChallengeStatus,
  type CutoffContext,
  type CutoffPhase,
  type PenaltyProofStatus,
  type PenaltyWindowPhase,
  type PenaltyProofView,
  type PenaltyStatusView,
} from "@withkey/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// 벌칙(만회 찬스) 창2 상태 read (spec §C3·§C4 / EVAL-0044). peer-rejection-counts·video-signed-url 미러.
//
// 세 가지를 채운다:
//   (a) viewer 본인 proof(status·signed URL) + 제출 자격(확정 미달분 X>0)
//   (b) 그룹 멤버 proof 목록 + 각 reject count + viewer_rejected (판단 UI)
//   (c) 창2 타임라인 게이트(window) — page 가 분기 렌더
//
// 익명성: voter_id 는 어떤 read 도 select 하지 않는다 — head count 와 본인 행 존재 여부만 조회한다
//   (peer-rejection-counts·peer-rejection-viewer 와 동일 메커니즘).

const SIGNED_TTL_SECONDS = 600; // 10분 — Storage createSignedUrl ttl 과 정합 (video-signed-url.ts 동일).
const WINDOW_OPEN_MS = 48 * 60 * 60 * 1000; // 창2 시작 = 종료+48h (submit_penalty_proof RPC 와 정합).
const WINDOW_CLOSE_MS = 96 * 60 * 60 * 1000; // 창2 만료 = 종료+96h.

// view-model 타입은 @withkey/domain read-contract 가 SoT (web·RN·BFF 공유, spec §C2 승격).
// 기존 web consumer(penalty-proof-card.tsx)의 import path 를 깨지 않게 re-export 보존.
export type { PenaltyWindowPhase, PenaltyProofView, PenaltyStatusView };

type ChallengeRow = {
  id: string;
  title: string;
  group_id: string;
  goal_count: number;
  duration_days: number;
  penalty_amount: number;
  penalty_mission: string | null;
  status: string;
  start_at: string | null;
  end_at: string | null;
  closed_at: string | null;
};

// 🟨 익명 reject count (peer-rejection-counts.ts 동형). voter_id 미select.
// admin + public 'use cache': count 는 viewer-agnostic. proofId 별 cache.
async function getPenaltyProofRejectCount(proofId: string): Promise<number> {
  "use cache";
  cacheTag(`penalty-proof-reject-count-${proofId}`);
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });

  const supabase = adminClient();
  const { count } = await supabase
    .from("penalty_proof_rejections")
    .select("id", { count: "exact", head: true })
    .eq("proof_id", proofId);
  return count ?? 0;
}

// 🟨 viewer 본인이 이 증명을 반려했는지 (peer-rejection-viewer.ts 동형). viewerId 가 세 곳 모두에:
// cached arg(파티션) · cacheTag(무효화) · .eq SQL filter(admin RLS 우회 방어선).
async function getViewerPenaltyProofRejection(proofId: string, viewerId: string): Promise<boolean> {
  "use cache";
  cacheTag(`user-${viewerId}-penalty-proof-reject-${proofId}`);
  cacheLife("minutes");

  const supabase = adminClient();
  const { count } = await supabase
    .from("penalty_proof_rejections")
    .select("id", { count: "exact", head: true })
    .eq("proof_id", proofId)
    .eq("voter_id", viewerId);
  return (count ?? 0) > 0;
}

// signed URL (video-signed-url.ts 패턴). admin + public cache, path 별 viewer-agnostic.
async function getPenaltyVideoSignedUrl(mediaPath: string): Promise<string | null> {
  "use cache";
  cacheTag(`penalty-video-${mediaPath}`);
  cacheLife({
    stale: SIGNED_TTL_SECONDS - 60,
    revalidate: SIGNED_TTL_SECONDS - 120,
    expire: SIGNED_TTL_SECONDS,
  });

  const supabase = adminClient();
  const { data, error } = await supabase.storage
    .from("action-videos")
    .createSignedUrl(mediaPath, SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

function windowPhaseFor(endAt: string | null, now: number): PenaltyWindowPhase {
  if (!endAt) return "before";
  const end = new Date(endAt).getTime();
  if (now < end + WINDOW_OPEN_MS) return "before";
  if (now > end + WINDOW_CLOSE_MS) return "expired";
  return "open";
}

// cookie 세션 경로(web RSC) — Layer 1 을 cookie client 로 주입해 변형에 위임. 동작 무변경.
export async function fetchPenaltyStatus(
  challengeId: string,
  viewerId: string,
): Promise<PenaltyStatusView | null> {
  const supabase = await createClient();
  return fetchPenaltyStatusForViewerClient(supabase, challengeId, viewerId);
}

// 한 챌린지의 벌칙 창2 상태를 viewer 관점으로 읽는다. Bearer(BFF /api/penalty-status) 경로 — RN 전용
// (ADR-0036 §1·§2, feed fetchChallengeFeedForViewerClient 모델).
// Layer 1(challenges·participants·action_logs·penalty_proofs·users)은 호출자가 주입한 RLS user client 로
// 실행한다(admin 대체 금지) — RLS(penalty_proofs_select_group_member)가 비멤버 접근을 차단한다.
// Layer 2(reject count·signed URL·viewer flag)는 ADR-0024 admin hydrate read(위 3개)로 그대로 공유한다.
export async function fetchPenaltyStatusForViewerClient(
  viewerClient: SupabaseClient,
  challengeId: string,
  viewerId: string,
): Promise<PenaltyStatusView | null> {
  const supabase = viewerClient;

  const { data: c, error } = await supabase
    .from("challenges")
    .select(
      "id, title, group_id, goal_count, duration_days, penalty_amount, penalty_mission, status, start_at, end_at, closed_at",
    )
    .eq("id", challengeId)
    .maybeSingle();
  if (error) {
    console.error("[penalty-status] challenge read failed", { challengeId, error });
    throw new Error(`fetchPenaltyStatus(${challengeId}) failed: ${error.message}`);
  }
  if (!c) return null;
  const ch = c as unknown as ChallengeRow;

  // 서약 참가자(과반 분모 N) + viewer 멤버십.
  const { data: parts } = await supabase
    .from("challenge_participants")
    .select("user_id, signed_at")
    .eq("challenge_id", challengeId);
  const signedParticipantCount = (parts ?? []).filter((p) => p.signed_at != null).length;
  const viewerPart = (parts ?? []).find((p) => p.user_id === viewerId);
  const isParticipant = viewerPart != null;
  const isSigned = viewerPart?.signed_at != null;

  // viewer 확정 미달분 X — 끝난 주 미달 합(weekly accrual 재사용). 창1 동결분과 동형.
  let viewerConfirmedPenalty = 0;
  const startKey = ch.start_at ? toKstDayKey(ch.start_at) : null;
  if (startKey) {
    const { data: myLogs } = await supabase
      .from("action_logs")
      .select("created_at")
      .eq("challenge_id", challengeId)
      .eq("user_id", viewerId);
    const phase = challengePhase(ch.status as ChallengeStatus, ch.end_at);
    const ctx: CutoffContext = {
      phase: phase as CutoffPhase,
      durationDays: ch.duration_days,
      todayDayIndex: dayIndexOf(toKstDayKey(new Date()), startKey),
      closedAt: ch.closed_at,
      startKey,
    };
    const dayKeys = (myLogs ?? []).map((l) => toKstDayKey(l.created_at));
    viewerConfirmedPenalty = confirmedPenalty(
      weekBucketsFromDayKeys(dayKeys, startKey, ch.duration_days),
      ctx,
      { goalCount: ch.goal_count, penaltyAmount: ch.penalty_amount },
    );
  }

  // proof 목록 (RLS: 같은 그룹 멤버만 SELECT). voter_id 미존재(다른 테이블)라 익명성 자동 보존.
  const { data: proofRows } = await supabase
    .from("penalty_proofs")
    .select("id, user_id, media_path, status, submitted_at")
    .eq("challenge_id", challengeId)
    .order("submitted_at", { ascending: true });

  const nameById = new Map<string, string>();
  if (proofRows && proofRows.length > 0) {
    const userIds = Array.from(new Set(proofRows.map((p) => p.user_id)));
    const { data: users } = await supabase
      .from("users")
      .select("id, display_name")
      .in("id", userIds);
    for (const u of users ?? []) nameById.set(u.id, u.display_name ?? "익명");
  }

  const proofs: PenaltyProofView[] = await Promise.all(
    (proofRows ?? []).map(async (p) => {
      const [rejectCount, viewerRejected, videoSignedUrl] = await Promise.all([
        getPenaltyProofRejectCount(p.id),
        // viewer 본인 증명이면 본인 반려 불가(0055 §F) — 조회 생략.
        p.user_id === viewerId
          ? Promise.resolve(false)
          : getViewerPenaltyProofRejection(p.id, viewerId),
        getPenaltyVideoSignedUrl(p.media_path),
      ]);
      return {
        proofId: p.id,
        performerId: p.user_id,
        performerName: nameById.get(p.user_id) ?? "익명",
        status: p.status as PenaltyProofStatus,
        videoSignedUrl,
        rejectCount,
        viewerRejected,
        rejectedByPeers: isPenaltyProofRejectedByPeers(rejectCount, signedParticipantCount),
        isViewer: p.user_id === viewerId,
      };
    }),
  );

  const viewerProof = proofs.find((p) => p.isViewer) ?? null;

  return {
    challengeId: ch.id,
    title: ch.title,
    penaltyMission: ch.penalty_mission,
    penaltyAmount: ch.penalty_amount,
    windowPhase: windowPhaseFor(ch.closed_at ?? ch.end_at, Date.now()),
    endAt: ch.closed_at ?? ch.end_at,
    isParticipant,
    isSigned,
    viewerConfirmedPenalty,
    viewerProof,
    proofs,
    signedParticipantCount,
  };
}

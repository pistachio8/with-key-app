import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { track } from "@/lib/analytics/track";
import {
  findActionLogPhashDuplicates,
  type PhashDedupScope,
} from "@/lib/db/reads/phash-duplicates";
import { loadVerifyConfig, type VerifyConfig } from "./config";
import type { PhashMatch } from "./phash";
import { advisorySignalScore, type VerifySignals } from "./signals";

// θ 임계 자동검증 판정(EVAL-0022) — EVAL-0021 신호 → status 매핑을 완성한다.
// 매핑 SoT 는 false-flag-threshold-theta spec §판정 매핑:
//   기본 passed(친구 신뢰) · 명백 부정(동일-user/group phash 재탕 d ≤ failMax)만 failed ·
//   경계(failMax < d ≤ reviewMax, 동일-user/group)만 manual_review ·
//   전역 cross-user near-match 는 최대 manual_review(생판 남 충돌 오판 방지, auto-failed 금지) ·
//   EXIF·스크린샷은 advisory(auto_verify_score 에 기록만, 단독으로 status 를 내리지 않음) ·
//   신호 계산 오류(손상 이미지)는 manual_review 로 graceful(여전히 카운트).
// θ 는 하드코딩하지 않는다 — config.ts 가 server env 를 zod 로 읽어 주입한다.
// 단, scope 행동(sameUser/sameGroup → failed, global → 최대 manual_review)은 노브가 아니라
// 매핑 구조라 의도적으로 코드에 고정한다 — spec env 스케치의 VERIFY_PHASH_FAIL_SCOPES·
// VERIFY_PHASH_GLOBAL_ACTION 은 EVAL-0022 주입 범위(FAIL_MAX·REVIEW_MAX·ENFORCE) 밖이며,
// scope 정책 변경(예: 전역 cross-user 도 failed)은 PO 결정 + 코드 변경(PR)을 요구한다.
// shadow mode: status 는 enforce 와 무관하게 항상 would-be 결정으로 기록되고(신규 컬럼 없음,
//   EVAL-0020 non-goal), VERIFY_ENFORCE=true 에서만 failed 가 doneCount 제외로 해석된다.

// 판정 로직 버전 marker — 컬럼(auto_verify_model_version)의 최종 writer. 매핑 규칙이 바뀌면 bump.
export const JUDGE_MODEL_VERSION = "verify-judge-theta-v1";

/** 판정기가 내리는 status. pending/peer_rejected 는 판정기 출력이 아니다(0045 enum 참조). */
export type AutoVerifyStatus = "passed" | "failed" | "manual_review";

/** DB 컬럼이 가질 수 있는 status 전체(0045 CHECK 와 동일). */
export type AutoVerifyDbStatus = AutoVerifyStatus | "pending" | "peer_rejected";

export interface ScopedPhashMatches {
  /** 같은 user 의 prior 매치(챌린지·그룹 무관 — 다른 날/챌린지 재탕 포함). */
  sameUser: readonly PhashMatch[];
  /** 같은 그룹 내 cross-user 매치. */
  sameGroup: readonly PhashMatch[];
  /** 전역 cross-user 매치(동일 그룹 제외). */
  global: readonly PhashMatch[];
}

export interface JudgeDecision {
  status: AutoVerifyStatus;
  /** 판정 근거(메타 — 사진/일기 본문 아님). */
  reason:
    | "clean"
    | "same_user_reuse"
    | "same_group_reuse"
    | "near_duplicate"
    | "global_near_match"
    | "signal_error";
  /** 판정 근거 scope 의 최소 해밍거리. 매치 무관 판정이면 null. */
  distance: number | null;
}

function minDistance(matches: readonly PhashMatch[]): number | null {
  if (matches.length === 0) return null;
  return matches.reduce((min, m) => Math.min(min, m.distance), Infinity);
}

/**
 * 순수 판정: scope 분류된 phash 매치 + 주입 θ → status. EXIF·스크린샷 신호는 입력에 없다 —
 * advisory 라 status 에 영향을 주지 않고 auto_verify_score 로 이미 기록된다(EVAL-0021).
 */
export function judgeVerifyStatus(
  matches: ScopedPhashMatches,
  config: VerifyConfig,
): JudgeDecision {
  const sameUserMin = minDistance(matches.sameUser);
  const sameGroupMin = minDistance(matches.sameGroup);

  // 1) 명백 부정 — 동일-user/group 재사용(d ≤ failMax)만 failed (AC-cheat-detect-2).
  if (sameUserMin !== null && sameUserMin <= config.phashFailMax) {
    return { status: "failed", reason: "same_user_reuse", distance: sameUserMin };
  }
  if (sameGroupMin !== null && sameGroupMin <= config.phashFailMax) {
    return { status: "failed", reason: "same_group_reuse", distance: sameGroupMin };
  }

  // 2) 경계 near-dup — 동일-user/group failMax < d ≤ reviewMax 만 manual_review (AC-auto-verify-3).
  const ownMin =
    sameUserMin === null
      ? sameGroupMin
      : sameGroupMin === null
        ? sameUserMin
        : Math.min(sameUserMin, sameGroupMin);
  if (ownMin !== null && ownMin <= config.phashReviewMax) {
    return { status: "manual_review", reason: "near_duplicate", distance: ownMin };
  }

  // 3) 전역 cross-user — d ≤ failMax 라도 auto-failed 금지, 최대 manual_review.
  //    경계 구간(failMax < d ≤ reviewMax)의 전역 매치는 신호 기록만(passed) — spec §판정 매핑 3·4.
  const globalMin = minDistance(matches.global);
  if (globalMin !== null && globalMin <= config.phashFailMax) {
    return { status: "manual_review", reason: "global_near_match", distance: globalMin };
  }

  // 4) 기본 passed — 친구 신뢰 (AC-auto-verify-1).
  return { status: "passed", reason: "clean", distance: null };
}

/**
 * status → doneCount 인정 여부(read-time 해석). shadow(`enforce=false`)에선 failed 도
 * would-be 기록일 뿐 아무도 차단하지 않는다 — enforce=true 에서만 failed 가 카운트 제외.
 * manual_review 는 '기계가 확신 못 함' UI 힌트일 뿐 항상 카운트 인정(사람 검토 큐 없음, PRD Q8).
 * peer_rejected 는 사람(피어 다수결)의 결정이라 기계 θ·enforce 와 무관하게 제외(EVAL-0025 가 write).
 * pending 은 판정 전 — 기본 신뢰로 인정.
 */
export function countsTowardDone(status: AutoVerifyDbStatus, config: VerifyConfig): boolean {
  if (status === "peer_rejected") return false;
  if (status === "failed") return !config.enforce;
  return true;
}

/**
 * 순수 분류: 그룹/전역 중복 조회 결과를 판정 scope(sameUser/sameGroup/global)로 가른다.
 * sameUser 는 전역 결과에서 뽑는다 — 같은 user 의 다른 그룹/챌린지 재탕도 failed 대상(spec §매핑 1).
 */
export function classifyPhashMatches(args: {
  userId: string;
  groupMatches: readonly PhashMatch[];
  globalMatches: readonly PhashMatch[];
}): ScopedPhashMatches {
  const groupLogIds = new Set(args.groupMatches.map((m) => m.actionLogId));
  return {
    sameUser: args.globalMatches.filter((m) => m.userId === args.userId),
    sameGroup: args.groupMatches.filter((m) => m.userId !== args.userId),
    global: args.globalMatches.filter(
      (m) => m.userId !== args.userId && !groupLogIds.has(m.actionLogId),
    ),
  };
}

/**
 * 신호 → 판정 → EVAL-0020 컬럼 write 오케스트레이션. service_role(adminClient)로
 * auto_verify_status·auto_verify_model_version 만 UPDATE 한다(0045 가드 허용 경로).
 * 본문(사진·일기)은 로깅하지 않는다 — 메타(status·reason·distance)만.
 * signals=null(계산 오류)이면 중복 조회 없이 manual_review graceful.
 */
export async function judgeAndRecordVerifyStatus(args: {
  actionLogId: string;
  /** auto_verify_result emit 용 — judge 는 status 만 보지만 이벤트는 challenge 차원이 필요. */
  challengeId: string;
  userId: string;
  groupId: string;
  signals: VerifySignals | null;
  /** 테스트 θ 픽스처 주입용. 생략 시 server env(loadVerifyConfig). */
  config?: VerifyConfig;
}): Promise<JudgeDecision> {
  const config = args.config ?? loadVerifyConfig();

  let decision: JudgeDecision;
  if (!args.signals) {
    decision = { status: "manual_review", reason: "signal_error", distance: null };
  } else {
    const groupScope: PhashDedupScope = {
      kind: "group",
      groupId: args.groupId,
      excludeActionLogId: args.actionLogId,
    };
    const globalScope: PhashDedupScope = { kind: "global", excludeActionLogId: args.actionLogId };
    const [group, global] = await Promise.all([
      findActionLogPhashDuplicates(args.signals.phash, groupScope),
      findActionLogPhashDuplicates(args.signals.phash, globalScope),
    ]);
    decision = judgeVerifyStatus(
      classifyPhashMatches({
        userId: args.userId,
        groupMatches: group.matches,
        globalMatches: global.matches,
      }),
      config,
    );
  }

  // record.ts 와 동일하게 user_id AND 필터로 소유 범위를 함수 레이어에서도 좁힌다.
  const supabase = adminClient();
  const { error } = await supabase
    .from("action_logs")
    .update({
      auto_verify_status: decision.status,
      auto_verify_model_version: JUDGE_MODEL_VERSION,
    })
    .eq("id", args.actionLogId)
    .eq("user_id", args.userId);
  if (error) throw error;

  if (decision.status !== "passed") {
    // shadow 관찰용 메타 로그 — would-be 결정 자체는 컬럼에 기록됨.
    console.warn("[judgeAndRecordVerifyStatus] non-passed decision", {
      actionLogId: args.actionLogId,
      status: decision.status,
      reason: decision.reason,
      distance: decision.distance,
      enforce: config.enforce,
    });
  }

  // C1 — 모든 제출(passed 포함) emit. false-flag rate 는 분모(전체)가 필요하다.
  // phashDup = "동일 user/group near-match 존재"(spec C1). decision.reason 파생.
  // global_near_match(cross-user 전역)·signal_error·clean 은 제외 — 전역은 생판 남 충돌이라
  // dup 으로 세면 안 된다(judgeVerifyStatus 매핑 3). 본문(사진) 미로깅 — 메타만.
  const phashDup =
    decision.reason === "same_user_reuse" ||
    decision.reason === "same_group_reuse" ||
    decision.reason === "near_duplicate";
  void track({
    name: "auto_verify_result",
    props: {
      actionLogId: args.actionLogId,
      challengeId: args.challengeId,
      status: decision.status,
      phashDup,
      exifMissing: args.signals ? !args.signals.exifPresent : false,
      screenshot: args.signals ? args.signals.screenshot.suspected : false,
      score: args.signals ? advisorySignalScore(args.signals) : null,
      modelVersion: JUDGE_MODEL_VERSION,
      enforced: config.enforce,
    },
  });
  return decision;
}

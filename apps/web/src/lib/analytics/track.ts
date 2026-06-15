// PRD §9.1 이벤트 스키마와 1:1. 임의 추가 금지 (PO 승인).
import type { ActivityType } from "@withkey/domain";
import { adminClient } from "@/lib/supabase/admin";
import { analyticsEventSchema } from "./schema";

export type AnalyticsEvent =
  | { name: "user_signed_up"; props: { provider: "kakao" | "email"; invitedBy?: string } }
  | {
      name: "group_created";
      props: { groupId: string; memberTarget: number; hasAccount?: boolean };
    }
  | { name: "account_copied"; props: { groupId: string } }
  | { name: "invite_sent"; props: { groupId: string } }
  | { name: "invite_opened"; props: { groupId: string; fromOrganicUser: boolean } }
  | {
      name: "challenge_created";
      props: {
        challengeId: string;
        penaltyAmount: number;
        goalCount: number;
        // 코호트 분리(솔로 1 / 그룹 ≥2)에 사용. 생성 시점 참가자 수 — PR-2 도입.
        participantCount: number;
      };
    }
  | { name: "challenge_signed"; props: { challengeId: string; userId: string } }
  | {
      name: "challenge_activated";
      props: {
        challengeId: string;
        signToActiveMs: number;
        // 활성화 시점 참가자 수 — 코호트 분리 기준 (J-2(a): created_at→active 측정).
        participantCount: number;
      };
    }
  | { name: "action_started"; props: { challengeId: string } }
  | {
      name: "keywords_shown";
      props: {
        activityType: ActivityType;
        shownKeywords: string[];
        source: "initial" | "reroll";
        poolVersion: string;
      };
    }
  | { name: "keywords_reroll"; props: { activityType: ActivityType; rerollCount: number } }
  | {
      name: "keyword_selected";
      props: {
        keyword: string;
        selectedCount: number;
        activityType: ActivityType;
        action: "add" | "remove";
      };
    }
  | { name: "memo_fallback_opened"; props: Record<string, never> }
  | {
      name: "action_logged";
      props: {
        challengeId: string;
        activityType: ActivityType;
        selectedKeywords: string[];
        keywordCount: number;
        hasMemo: boolean;
        rerollCount: number;
        photoSize: number;
        photoAttached: boolean;
        poolVersion: string;
      };
    }
  | {
      name: "ai_generated";
      props: {
        actionLogId: string;
        latencyMs: number;
        fallback: boolean;
        keywordCoverage: number;
        promptVersion: string;
      };
    }
  | { name: "feed_view"; props: { unreadCount: number } }
  | { name: "kudos_given"; props: { emoji: string; actionLogId: string } }
  | {
      name: "notification_sent";
      props: {
        type: "start" | "deadline" | "friend_action" | "kudos_received" | "goal_unreachable";
        challengeId: string;
        suppressed: boolean;
        outcome: "sent" | "cleaned" | "failed" | "suppressed";
        // kudos_received 만 채움 (ADR-0017). start/deadline/friend_action 발송에는 의미 없음.
        actionLogId?: string;
        actorUserId?: string;
        // goal_unreachable 만 채움 — (challenge,user,week) 단위 dedup 키. 주차 1-based.
        week?: number;
      };
    }
  | {
      name: "notification_opened";
      props: { type: "start" | "deadline" | "friend_action"; challengeId: string };
    }
  | {
      name: "auto_verify_result";
      props: {
        actionLogId: string; // uuid
        challengeId: string; // uuid — 콜사이트 주입
        status: "passed" | "failed" | "manual_review"; // 판정기 출력(peer_rejected 없음)
        phashDup: boolean; // 동일 user/group near-match 존재 (decision.reason 파생)
        exifMissing: boolean; // advisory
        screenshot: boolean; // advisory
        score: number | null; // advisorySignalScore(signals). signals=null(손상)→null
        modelVersion: string; // JUDGE_MODEL_VERSION
        enforced: boolean; // config.enforce. shadow면 failed라도 doneCount 미제외
      };
    }
  | {
      name: "peer_reject";
      props: {
        actionLogId: string; // uuid — 반려 대상
        challengeId: string; // uuid
        rejectCount: number; // RPC peer_reject_count (총 반려 수)
        status: "passed" | "peer_rejected" | "failed" | "manual_review" | "pending"; // RPC status raw
        action: "add" | "remove"; // viewer_rejected 파생
      };
    }
  | { name: "penalty_displayed"; props: { amount: number } };

type TrackOptions = { userId?: string };

/**
 * Fire-and-forget analytics insert. Never throws.
 *
 * Server/system events can point at a recipient user_id that is not the acting
 * Supabase session, so inserts use service_role and Zod becomes the runtime
 * shape boundary for props that RLS cannot inspect.
 */
export async function track<E extends AnalyticsEvent>(
  event: E,
  options: TrackOptions = {},
): Promise<void> {
  const parsed = analyticsEventSchema.safeParse(event);
  if (!parsed.success) {
    console.error("[track] schema violation", parsed.error.flatten());
    return;
  }

  try {
    const { error } = await adminClient()
      .from("events")
      .insert({
        name: parsed.data.name,
        props: parsed.data.props,
        user_id: options.userId ?? null,
      });

    if (error) {
      console.error("[track] insert failed", { name: parsed.data.name, error });
    }
  } catch (error) {
    console.error("[track] insert failed", { name: parsed.data.name, error });
  }
}

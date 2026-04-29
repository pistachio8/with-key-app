// PRD §9.1 이벤트 스키마와 1:1. 임의 추가 금지 (PO 승인).
import type { ActivityType } from "@/lib/keywords/pool";

export type AnalyticsEvent =
  | { name: "user_signed_up"; props: { provider: "kakao" | "email"; invitedBy?: string } }
  | { name: "group_created"; props: { groupId: string; memberTarget: number } }
  | { name: "invite_sent"; props: { groupId: string } }
  | { name: "invite_opened"; props: { groupId: string; fromOrganicUser: boolean } }
  | {
      name: "challenge_created";
      props: { challengeId: string; penaltyAmount: number; goalCount: number };
    }
  | { name: "challenge_signed"; props: { challengeId: string; userId: string } }
  | { name: "challenge_activated"; props: { challengeId: string; signToActiveMs: number } }
  | { name: "action_started"; props: { challengeId: string } }
  | {
      name: "keywords_shown";
      props: { activityType: ActivityType; shownKeywords: string[]; source: "initial" | "reroll" };
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
  | { name: "notification_sent"; props: { type: "start" | "deadline" } }
  | { name: "notification_opened"; props: { type: "start" | "deadline" } }
  | { name: "penalty_displayed"; props: { amount: number } };

export async function track<E extends AnalyticsEvent>(event: E): Promise<void> {
  // POC 초기: Supabase `events` 테이블에 insert 예정.
  // 실제 구현은 BE 스키마 확정 후 추가 — Day 1엔 no-op + console 로깅.
  if (process.env.NODE_ENV !== "production") {
    console.debug("[track]", event.name, event.props);
  }
}

import { z } from "zod";
import { ACTIVITY_TYPES } from "@/lib/keywords/pool";

const activityType = z.enum(ACTIVITY_TYPES);
const uuid = z.string().uuid();

export const analyticsEventSchema = z.discriminatedUnion("name", [
  z.object({
    name: z.literal("user_signed_up"),
    props: z.object({ provider: z.enum(["kakao", "email"]), invitedBy: z.string().optional() }),
  }),
  z.object({
    name: z.literal("group_created"),
    props: z.object({
      groupId: uuid,
      memberTarget: z.number().int().min(2),
      hasAccount: z.boolean().optional(),
    }),
  }),
  z.object({
    name: z.literal("account_copied"),
    props: z.object({ groupId: uuid }),
  }),
  z.object({ name: z.literal("invite_sent"), props: z.object({ groupId: uuid }) }),
  z.object({
    name: z.literal("invite_opened"),
    props: z.object({ groupId: uuid, fromOrganicUser: z.boolean() }),
  }),
  z.object({
    name: z.literal("challenge_created"),
    props: z.object({
      challengeId: uuid,
      penaltyAmount: z.number().int(),
      goalCount: z.number().int(),
      participantCount: z.number().int().min(1),
    }),
  }),
  z.object({
    name: z.literal("challenge_signed"),
    props: z.object({ challengeId: uuid, userId: uuid }),
  }),
  z.object({
    name: z.literal("challenge_activated"),
    props: z.object({
      challengeId: uuid,
      signToActiveMs: z.number().int().min(0),
      participantCount: z.number().int().min(1),
    }),
  }),
  z.object({ name: z.literal("action_started"), props: z.object({ challengeId: uuid }) }),
  z.object({
    name: z.literal("keywords_shown"),
    props: z.object({
      activityType,
      shownKeywords: z.array(z.string()).min(1),
      source: z.enum(["initial", "reroll"]),
      // spec 2026-05-22 — 키워드 풀 v1.1 release 분기점 (ADR-0015).
      poolVersion: z.string(),
    }),
  }),
  z.object({
    name: z.literal("keywords_reroll"),
    props: z.object({ activityType, rerollCount: z.number().int().min(1) }),
  }),
  z.object({
    name: z.literal("keyword_selected"),
    props: z.object({
      keyword: z.string(),
      selectedCount: z.number().int().min(0),
      activityType,
      action: z.enum(["add", "remove"]),
    }),
  }),
  z.object({ name: z.literal("memo_fallback_opened"), props: z.object({}).strict() }),
  z.object({
    name: z.literal("action_logged"),
    props: z.object({
      challengeId: uuid,
      activityType,
      selectedKeywords: z.array(z.string()).min(1),
      keywordCount: z.number().int().min(1).max(3),
      hasMemo: z.boolean(),
      rerollCount: z.number().int().min(0).max(5),
      photoSize: z.number().int().min(0),
      photoAttached: z.boolean(),
      // spec 2026-05-22 — 키워드 풀 v1.1 release 분기점 (ADR-0015).
      poolVersion: z.string(),
    }),
  }),
  z.object({
    name: z.literal("ai_generated"),
    props: z.object({
      actionLogId: uuid,
      latencyMs: z.number().int().min(0),
      fallback: z.boolean(),
      keywordCoverage: z.number().min(0).max(1),
      promptVersion: z.string(),
    }),
  }),
  z.object({
    name: z.literal("feed_view"),
    props: z.object({ unreadCount: z.number().int().min(0) }),
  }),
  z.object({
    name: z.literal("kudos_given"),
    props: z.object({ emoji: z.string(), actionLogId: uuid }),
  }),
  z.object({
    name: z.literal("notification_sent"),
    props: z.object({
      type: z.enum(["start", "deadline", "friend_action", "kudos_received", "goal_unreachable"]),
      challengeId: uuid,
      suppressed: z.boolean(),
      outcome: z.enum(["sent", "cleaned", "failed", "suppressed"]),
      // kudos_received 만 채움. start/deadline/friend_action 발송에는 의미 없음.
      actionLogId: uuid.optional(),
      actorUserId: uuid.optional(),
      // goal_unreachable 만 채움 — (challenge,user,week) dedup 키. 주차 1-based.
      week: z.number().int().min(1).optional(),
    }),
  }),
  z.object({
    name: z.literal("notification_opened"),
    props: z.object({
      type: z.enum(["start", "deadline", "friend_action"]),
      challengeId: uuid,
    }),
  }),
  z.object({
    name: z.literal("penalty_displayed"),
    props: z.object({ amount: z.number().int() }),
  }),
]);

import { describe, expect, it } from "vitest";
import { analyticsEventSchema } from "./schema";
import type { AnalyticsEvent } from "./track";

const fixtures: Record<AnalyticsEvent["name"], AnalyticsEvent> = {
  user_signed_up: { name: "user_signed_up", props: { provider: "email" } },
  group_created: {
    name: "group_created",
    props: { groupId: "11111111-1111-4111-8111-111111111111", memberTarget: 3 },
  },
  invite_sent: {
    name: "invite_sent",
    props: { groupId: "11111111-1111-4111-8111-111111111111" },
  },
  invite_opened: {
    name: "invite_opened",
    props: { groupId: "11111111-1111-4111-8111-111111111111", fromOrganicUser: true },
  },
  challenge_created: {
    name: "challenge_created",
    props: {
      challengeId: "11111111-1111-4111-8111-111111111111",
      penaltyAmount: 3000,
      goalCount: 3,
      participantCount: 1,
    },
  },
  challenge_signed: {
    name: "challenge_signed",
    props: {
      challengeId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
    },
  },
  challenge_activated: {
    name: "challenge_activated",
    props: {
      challengeId: "11111111-1111-4111-8111-111111111111",
      signToActiveMs: 1000,
      participantCount: 3,
    },
  },
  action_started: {
    name: "action_started",
    props: { challengeId: "11111111-1111-4111-8111-111111111111" },
  },
  keywords_shown: {
    name: "keywords_shown",
    props: {
      activityType: "gym",
      shownKeywords: ["펌핑"],
      source: "initial",
      poolVersion: "v1.1-meal-2026-05-22",
    },
  },
  keywords_reroll: {
    name: "keywords_reroll",
    props: { activityType: "gym", rerollCount: 1 },
  },
  keyword_selected: {
    name: "keyword_selected",
    props: { keyword: "펌핑", selectedCount: 1, activityType: "gym", action: "add" },
  },
  memo_fallback_opened: { name: "memo_fallback_opened", props: {} },
  action_logged: {
    name: "action_logged",
    props: {
      challengeId: "11111111-1111-4111-8111-111111111111",
      activityType: "gym",
      selectedKeywords: ["펌핑"],
      keywordCount: 1,
      hasMemo: false,
      rerollCount: 0,
      photoSize: 0,
      photoAttached: false,
      poolVersion: "v1.1-meal-2026-05-22",
    },
  },
  ai_generated: {
    name: "ai_generated",
    props: {
      actionLogId: "11111111-1111-4111-8111-111111111111",
      latencyMs: 100,
      fallback: false,
      keywordCoverage: 1,
      promptVersion: "v1",
    },
  },
  feed_view: { name: "feed_view", props: { unreadCount: 0 } },
  kudos_given: {
    name: "kudos_given",
    props: { emoji: "🔥", actionLogId: "11111111-1111-4111-8111-111111111111" },
  },
  notification_sent: {
    name: "notification_sent",
    props: {
      type: "start",
      challengeId: "11111111-1111-4111-8111-111111111111",
      suppressed: false,
      outcome: "sent",
    },
  },
  notification_opened: {
    name: "notification_opened",
    props: {
      type: "start",
      challengeId: "11111111-1111-4111-8111-111111111111",
    },
  },
  penalty_displayed: { name: "penalty_displayed", props: { amount: 3000 } },
  account_copied: {
    name: "account_copied",
    props: { groupId: "11111111-1111-4111-8111-111111111111" },
  },
};

describe("TS union ↔ Zod schema parity", () => {
  for (const [name, fixture] of Object.entries(fixtures)) {
    it(`Zod schema accepts ${name}`, () => {
      const r = analyticsEventSchema.safeParse(fixture);
      expect(r.success, JSON.stringify(r, null, 2)).toBe(true);
    });
  }
});

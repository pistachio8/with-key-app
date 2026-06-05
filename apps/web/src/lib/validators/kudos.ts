import { z } from "zod";

// PRD §7.3 AC-1: POC 한정 3개 이모지 · BE_SCHEMA §5.8 (feed_items 폐지 → action_log_id FK).
export const KUDOS_EMOJIS = ["🔥", "💪", "👏"] as const;
export const kudosEmojiSchema = z.enum(KUDOS_EMOJIS);

export const kudosInputSchema = z.object({
  actionLogId: z.string().uuid(),
  emoji: kudosEmojiSchema,
});

export type KudosEmoji = z.infer<typeof kudosEmojiSchema>;
export type KudosInput = z.infer<typeof kudosInputSchema>;

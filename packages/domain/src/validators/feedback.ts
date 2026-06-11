// 개발자에게 건의하기 입력 — spec: docs/superpowers/specs/2026-06-10-feedback-suggestion-design.md
// migration 0047 의 check 제약(category in / char_length 1..1000)과 1:1 동기.
import { z } from "zod";

export const FEEDBACK_CATEGORIES = ["bug", "feature", "other"] as const;
export const feedbackCategorySchema = z.enum(FEEDBACK_CATEGORIES);
export type FeedbackCategory = z.infer<typeof feedbackCategorySchema>;

export const feedbackSchema = z.object({
  category: feedbackCategorySchema,
  body: z.string().trim().min(1).max(1000),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;

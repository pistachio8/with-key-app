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

// 사진 첨부 최대 장수 — feedback.photo_paths check(array_length <= 3) 및 Slack 멀티 노출과 동기.
// ADR-0035 amendment(2026-06-18): 최초 1장 → 3장.
export const MAX_FEEDBACK_PHOTOS = 3;

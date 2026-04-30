import { z } from "zod";
import { ACTIVITY_TYPES, KEYWORD_POOL } from "@/lib/keywords/pool";

const activityType = z.enum(ACTIVITY_TYPES);
export const ALLOWED_PHOTO_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedPhotoMime = (typeof ALLOWED_PHOTO_MIME)[number];
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

// PRD §4.3 AC-2/9/10: 키워드 1~3개 필수 · 풀 내 값만 허용.
export const actionLogInputSchema = z
  .object({
    challengeId: z.string().uuid(),
    activityType,
    selectedKeywords: z.array(z.string()).min(1).max(3),
    shownKeywords: z.array(z.string()).min(1),
    rerollCount: z.number().int().min(0).max(5),
    memo: z.string().max(100).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const pool = KEYWORD_POOL[data.activityType];
    data.selectedKeywords.forEach((kw, idx) => {
      if (!pool.includes(kw)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["selectedKeywords", idx],
          message: `'${kw}' is not in the ${data.activityType} pool`,
        });
      }
    });
  });

export type ActionLogInput = z.infer<typeof actionLogInputSchema>;

// Photo validation intentionally lives in uploadPhoto (size + extFromFile) +
// the Storage bucket policy (mime/size). A third Zod layer on FormData would
// reject iOS Safari HEIC uploads with empty Content-Type headers, so we rely
// on the upload/bucket pair as the runtime boundary.

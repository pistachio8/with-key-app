import { z } from "zod";
import { ACTIVITY_TYPES, KEYWORD_POOL } from "@/lib/keywords/pool";

const activityType = z.enum(ACTIVITY_TYPES);

// PRD §4.3 AC-2/9/10: 키워드 1~3개 필수 · 풀 내 값만 허용.
export const actionLogInputSchema = z
  .object({
    challengeId: z.string().uuid(),
    activityType,
    photoUrl: z.string().url(),
    selectedKeywords: z.array(z.string()).min(1).max(3),
    shownKeywords: z.array(z.string()).min(1),
    rerollCount: z.number().int().min(0).max(5),
    memo: z.string().max(100).optional(),
  })
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

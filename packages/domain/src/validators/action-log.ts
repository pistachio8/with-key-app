import { z } from "zod";
import { ACTIVITY_TYPES, KEYWORD_POOL } from "../keywords/pool";

const activityType = z.enum(ACTIVITY_TYPES);
export const ALLOWED_PHOTO_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedPhotoMime = (typeof ALLOWED_PHOTO_MIME)[number];
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

// PRD §4.3 AC-2/9/10: 키워드 최대 3개 · 풀 내 값만 허용.
// 직접 입력 일기(memo 가 채워진 경우, spec 2026-05-28-action-manual-diary)에는
// 키워드가 AI 생성용 입력이 아니라 무시되므로 0개를 허용한다. memo 가 없으면
// (= AI 모드) 최소 1개를 강제한다 — 검증은 아래 superRefine 에서 조건부로 처리.
export const actionLogInputSchema = z
  .object({
    challengeId: z.string().uuid(),
    activityType,
    selectedKeywords: z.array(z.string()).max(3),
    shownKeywords: z.array(z.string()).min(1),
    rerollCount: z.number().int().min(0).max(5),
    // 직접 입력 일기 본문. ai_summary(char_length <= 150)에 저장되므로 150자.
    memo: z.string().max(150).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasMemo = typeof data.memo === "string" && data.memo.trim().length > 0;
    // AI 모드(직접 입력 없음)에서는 키워드 1개 이상 필수.
    if (!hasMemo && data.selectedKeywords.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["selectedKeywords"],
        message: "키워드를 1개 이상 선택하거나 일기를 직접 입력하세요.",
      });
    }
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

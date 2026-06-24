import { z } from "zod";

// BE_SCHEMA §5.5 · D-006(7~90일, ADR-0004) · D-007(0~10,000 / 1,000원 단위, #58)
// feedType·penaltyMission: spec §C1(2026-06-23-feed-type-penalty-redesign) · ADR-0039 · ADR-0040
export const challengeInputSchema = z.object({
  title: z.string().min(1).max(30),
  type: z.literal("fitness"),
  goalCount: z.number().int().min(1).max(7),
  durationDays: z.number().int().min(7).max(90),
  penaltyAmount: z
    .number()
    .int()
    .min(0)
    .max(10000)
    .refine((v) => v % 1000 === 0, "1000원 단위"),
  // 인증 medium·결과물 타입. 기본 image 로 기존 동작·migration backfill 과 일치(DB default 'image').
  feedType: z.enum(["image", "video"]).default("image"),
  // 그룹장 벌칙 미션(자유 입력). 없으면 기존 벌금 전용, 있으면 redemption(deferred penalty) 경로 활성.
  penaltyMission: z.string().min(1).max(80).optional(),
});

export const challengeStatusSchema = z.enum(["pending", "accepted", "active", "closed"]);

export const challengeSchema = challengeInputSchema.extend({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  status: challengeStatusSchema,
  startAt: z.string().datetime().nullable(),
  endAt: z.string().datetime().nullable(),
});

export type ChallengeInput = z.infer<typeof challengeInputSchema>;
export type Challenge = z.infer<typeof challengeSchema>;
export type ChallengeStatus = z.infer<typeof challengeStatusSchema>;

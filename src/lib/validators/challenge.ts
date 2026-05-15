import { z } from "zod";

// BE_SCHEMA §5.5 · D-006(7~90일, ADR-0004) · D-007(0~10,000 / 1,000원 단위, #58)
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

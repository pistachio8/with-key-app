import { z } from "zod";

// PRD §3.3 AC-1
export const challengeInputSchema = z.object({
  title: z.string().min(1).max(30),
  type: z.literal("fitness"),
  goalCount: z.number().int().min(1).max(7),
  durationDays: z.literal(7),
  penaltyAmount: z
    .number()
    .int()
    .min(1000)
    .max(20000)
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

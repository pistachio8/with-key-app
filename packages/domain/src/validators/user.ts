import { z } from "zod";

export const userSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1).max(20),
  avatarUrl: z.string().url().nullable(),
  authProvider: z.enum(["kakao", "email"]),
  createdAt: z.string().datetime(),
});

export type User = z.infer<typeof userSchema>;

import { z } from "zod";

// BE_SCHEMA §5.2: name optional · char_length <= 30
export const groupInputSchema = z.object({
  name: z.string().min(1).max(30).optional(),
});

export type GroupInput = z.infer<typeof groupInputSchema>;

import { z } from "zod";

export const titleSchema = z.object({
  title: z.string().trim().min(1).max(100),
});

export type ChatSessionTitle = z.infer<typeof titleSchema>;
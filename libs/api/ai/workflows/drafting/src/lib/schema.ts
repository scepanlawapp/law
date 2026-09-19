import { z } from "zod";

export const draftResultSchema = z.object({
  documentText: z.string(),
  warnings: z.array(z.string()).default([]),
  usedCitations: z.array(z.number()).default([]),
});

export type DraftResult = z.infer<typeof draftResultSchema>;

import { z } from "zod";
import type { ContractReviewResult } from "@law/api-interfaces";

const nullableText = z
  .string()
  .nullable()
  .default(null)
  .transform((value) => (value?.trim() ? value.trim() : null));

const keyTermSchema = z.object({
  label: z.string(),
  value: z.string(),
  clause: nullableText,
});

const issueSchema = z.object({
  title: z.string(),
  category: z.enum(["RISK", "COMPLIANCE"]),
  risk: z.enum(["HIGH", "MEDIUM", "LOW"]),
  clause: nullableText,
  quote: nullableText,
  explanation: z.string(),
  suggestion: nullableText,
  citations: z.array(z.number().int()).default([]),
});

const missingClauseSchema = z.object({
  title: z.string(),
  explanation: z.string(),
  suggestion: nullableText,
});

/** What the model returns. */
export const contractReviewLlmSchema = z.object({
  summary: z.string(),
  keyTerms: z.array(keyTermSchema).default([]),
  issues: z.array(issueSchema).default([]),
  missingClauses: z.array(missingClauseSchema).default([]),
  warnings: z.array(z.string()).default([]),
  usedCitations: z.array(z.number().int()).default([]),
});

// The shared contract, not z.infer: projects compiled without strictNullChecks
// would otherwise see every field as optional.
export type ContractReviewLlmOutput = ContractReviewResult & {
  usedCitations: number[];
};

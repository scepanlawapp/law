import { z } from "zod";

export const BRIEF_JOB_TYPES = ["lawsuit", "contract", "other"] as const;

const partySchema = z.object({
  name: z.string().nullable(),
  address: z.string().nullable(),
});

export const briefResultSchema = z.object({
  jobType: z.enum(BRIEF_JOB_TYPES).nullable(),
  plaintiff: partySchema,
  defendant: partySchema,
  competentCourt: z.string().nullable(),
  claimValue: z.string().nullable(),
  legalBasis: z.array(z.string()).default([]),
  factualDescription: z.string().nullable(),
  evidence: z.array(z.string()).default([]),
  reliefSought: z.string().nullable(),
  missingFields: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()).default([]),
});

export type BriefResult = z.infer<typeof briefResultSchema>;

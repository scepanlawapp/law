import { z } from "zod";
import { BRIEF_MISSING_FIELD_KEYS } from "@law/api-interfaces";
import { normalizeEvidence, normalizeMissingFields } from "./normalize";

export const BRIEF_JOB_TYPES = ["lawsuit", "contract", "other"] as const;

const missingFieldSchema = z.object({
  key: z.enum(BRIEF_MISSING_FIELD_KEYS),
  label: z.string(),
});

const evidenceSchema = z.object({
  label: z.string(),
  provided: z.boolean(),
});

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
  // Normalize legacy string output and unknown keys before validating.
  evidence: z.preprocess(normalizeEvidence, z.array(evidenceSchema)),
  reliefSought: z.string().nullable(),
  missingFields: z.preprocess(
    normalizeMissingFields,
    z.array(missingFieldSchema),
  ),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()).default([]),
});

export type BriefResult = z.infer<typeof briefResultSchema>;

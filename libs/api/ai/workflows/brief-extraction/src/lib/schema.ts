import { z } from "zod";
import {
  DRAFT_DOCUMENT_TYPES,
  type BriefResult as BriefResultContract,
} from "@law/api-interfaces";
import { normalizeEvidence, normalizeMissingFields } from "./normalize";

const missingFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
});

const evidenceSchema = z.object({
  label: z.string(),
  provided: z.boolean(),
});

// The model cites only the ref; normalization checks it against the provided
// facts and fills the title from them.
const sourceSchema = z.object({
  ref: z.string(),
  title: z.string().default(""),
});

const partySchema = z.object({
  role: z.string(),
  name: z.string().nullable(),
  address: z.string().nullable(),
  idNumber: z.string().nullable().default(null),
  source: sourceSchema.nullable().optional(),
});

const fieldValueSchema = z.object({
  key: z.string(),
  value: z.string().nullable(),
});

/** What the model returns; the document type is chosen before extraction. */
export const briefLlmOutputSchema = z.object({
  parties: z.array(partySchema).default([]),
  fields: z.array(fieldValueSchema).default([]),
  legalBasis: z.array(z.string()).default([]),
  factualDescription: z.string().nullable(),
  // Normalize legacy string output before validating.
  evidence: z.preprocess(normalizeEvidence, z.array(evidenceSchema)),
  missingFields: z.preprocess(
    (value) => normalizeMissingFields(value, null),
    z.array(missingFieldSchema),
  ),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()).default([]),
});

export const briefResultSchema = briefLlmOutputSchema.extend({
  documentType: z.enum(DRAFT_DOCUMENT_TYPES),
});

// The shared contract, not z.infer: projects compiled without strictNullChecks
// would otherwise see every field as optional.
export type BriefResult = BriefResultContract;
export type BriefLlmOutput = Omit<BriefResult, "documentType">;

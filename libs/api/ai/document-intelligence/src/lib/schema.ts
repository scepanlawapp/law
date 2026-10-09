import { z } from "zod";
import type { DocumentKind } from "@law/api-interfaces";
import { DOCUMENT_KINDS, SUBJECT_TYPES, type SubjectType } from "./kinds";

const KINDS = new Set<string>(DOCUMENT_KINDS);

/** Clamping happens in code; the schema only requires a number. */
const confidence = z.number().default(0);

export const classificationSchema = z.object({
  kind: z.preprocess(
    (value) =>
      typeof value === "string" && KINDS.has(value) ? value : "OTHER",
    z.enum([
      "ID_CARD",
      "PASSPORT",
      "APR_EXCERPT",
      "COURT_DECISION",
      "ADMIN_DECISION",
      "OTHER",
    ]),
  ),
  confidence,
});

const rawFactSchema = z.object({
  field: z.string(),
  value: z.string(),
  quote: z.string(),
  confidence,
});

const subjectSchema = z.object({
  subjectKey: z.string().min(1),
  subjectType: z.enum(SUBJECT_TYPES),
  subjectRole: z
    .string()
    .nullable()
    .default(null)
    .transform((value) => (value?.trim() ? value.trim() : null)),
  facts: z.array(rawFactSchema).default([]),
});

export const factExtractionSchema = z.object({
  subjects: z.array(subjectSchema).default([]),
});

// Explicit types, not z.infer: projects compiled without strictNullChecks
// would otherwise see every field as optional.
export interface Classification {
  kind: DocumentKind;
  confidence: number;
}

export interface RawSubjectFact {
  field: string;
  value: string;
  quote: string;
  confidence: number;
}

export interface RawSubject {
  subjectKey: string;
  subjectType: SubjectType;
  subjectRole: string | null;
  facts: RawSubjectFact[];
}

export interface FactExtraction {
  subjects: RawSubject[];
}

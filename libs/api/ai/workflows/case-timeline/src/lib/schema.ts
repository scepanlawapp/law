import { z } from "zod";
import {
  CASE_TIMELINE_EVENT_KINDS,
  type CaseTimelineEventKind,
} from "@law/api-interfaces";

const KINDS = new Set<string>(CASE_TIMELINE_EVENT_KINDS);

const optionalText = z
  .string()
  .nullable()
  .default(null)
  .transform((value) => (value?.trim() ? value.trim() : null));

const extractedEventSchema = z.object({
  /** Checked again in code; free text is allowed here and dropped later. */
  date: optionalText,
  dateText: optionalText,
  kind: z.preprocess(
    (value) =>
      typeof value === "string" && KINDS.has(value) ? value : "OTHER",
    z.enum(CASE_TIMELINE_EVENT_KINDS),
  ),
  title: z.string().min(1),
  description: z.string().default(""),
  quote: optionalText,
});

/** One document window's extraction. */
export const timelineExtractionSchema = z.object({
  documentSummary: z.string().default(""),
  events: z.array(extractedEventSchema).default([]),
});

/** The case-level summary over all documents. */
export const timelineSummarySchema = z.object({
  summary: z.string(),
  openQuestions: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

// Explicit types, not z.infer: projects compiled without strictNullChecks
// would otherwise see every field as optional.
export interface ExtractedTimelineEvent {
  date: string | null;
  dateText: string | null;
  kind: CaseTimelineEventKind;
  title: string;
  description: string;
  quote: string | null;
}

export interface TimelineExtraction {
  documentSummary: string;
  events: ExtractedTimelineEvent[];
}

export interface TimelineSummary {
  summary: string;
  openQuestions: string[];
  warnings: string[];
}

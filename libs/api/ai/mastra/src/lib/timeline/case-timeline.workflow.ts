import { createStep, createWorkflow } from "@mastra/core/workflows";
import type {
  CaseTimelineEvent,
  CaseTimelineResult,
  CaseTimelineSource,
} from "@law/api-interfaces";
import {
  buildTimelineExtractionSystemPrompt,
  buildTimelineExtractionUserPrompt,
  buildTimelineSummarySystemPrompt,
  buildTimelineSummaryUserPrompt,
  foldForMatch,
  mergeTimelineEvents,
  normalizeTimelineDate,
  runTimelineExtractionLlm,
  runTimelineSummaryLlm,
  splitIntoWindows,
  verifyQuote,
} from "@law/case-timeline";
import type { ChatModelProvider } from "@law/llm";
import { z } from "zod";

/**
 * Per-run dependencies, bound by closure (never via RequestContext) so the
 * model provider and its credentials never enter Mastra run state.
 */
export interface CaseTimelineWorkflowDeps {
  provider: ChatModelProvider;
}

const documentSchema = z.object({
  ref: z.string(),
  title: z.string(),
  status: z.enum(["COMPLETED", "FAILED", "UNSUPPORTED"]),
  /** Latin script. */
  text: z.string().optional(),
});

export const caseTimelineInputSchema = z.object({
  focus: z.string().nullable(),
  documents: z.array(documentSchema),
  /** Documents beyond the limit, listed as skipped. */
  skipped: z.array(z.object({ ref: z.string(), title: z.string() })),
  budget: z.object({
    windowChars: z.number().int().positive(),
    maxCharsPerDocument: z.number().int().positive(),
    summaryMaxChars: z.number().int().positive(),
    concurrency: z.number().int().positive(),
  }),
});

const extractedSchema = z.object({
  focus: z.string().nullable(),
  sources: z.array(z.any()),
  events: z.array(z.any()),
  summaryMaxChars: z.number(),
});

export const caseTimelineOutcomeSchema = z.object({
  result: z.any(),
  promptChars: z.number(),
  truncated: z.boolean(),
});

export type CaseTimelineInput = z.infer<typeof caseTimelineInputSchema>;
export interface CaseTimelineOutcome {
  result: CaseTimelineResult;
  promptChars: number;
  /** Some document was read only partly or skipped. */
  truncated: boolean;
}

/** Runs tasks with at most `limit` in flight; results keep input order. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await task(items[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/**
 * Case timeline as a Mastra workflow: extract dated events per document
 * window (bounded parallelism), merge and verify them in code, then summarize.
 * The source of every event is set in code; dates and quotes are checked
 * against the document. Read-only.
 */
export function createCaseTimelineWorkflow(deps: CaseTimelineWorkflowDeps) {
  const extract = createStep({
    id: "extract-events",
    inputSchema: caseTimelineInputSchema,
    outputSchema: extractedSchema,
    execute: async ({ inputData }) => {
      const { budget } = inputData;
      const system = buildTimelineExtractionSystemPrompt(inputData.focus);
      const readable = inputData.documents.filter(
        (doc) => doc.status === "COMPLETED" && doc.text?.trim(),
      );
      const perDocument = await mapLimit(
        inputData.documents,
        budget.concurrency,
        async (
          doc,
        ): Promise<{
          source: CaseTimelineSource;
          events: CaseTimelineEvent[];
        }> => {
          const text = doc.text?.trim() ?? "";
          if (doc.status !== "COMPLETED" || !text) {
            return {
              source: {
                ref: doc.ref,
                title: doc.title,
                status: "NO_TEXT",
                summary: null,
                eventCount: 0,
              },
              events: [],
            };
          }
          const { windows, truncated } = splitIntoWindows(
            text,
            budget.windowChars,
            budget.maxCharsPerDocument,
          );
          const folded = foldForMatch(text);
          try {
            const events: CaseTimelineEvent[] = [];
            let summary = "";
            for (const [index, window] of windows.entries()) {
              const output = await runTimelineExtractionLlm(
                deps.provider,
                system,
                buildTimelineExtractionUserPrompt({
                  documentTitle: doc.title,
                  window: index + 1,
                  windowCount: windows.length,
                  text: window,
                }),
              );
              if (!summary && output.documentSummary.trim()) {
                summary = output.documentSummary.trim();
              }
              for (const event of output.events) {
                const title = event.title.trim();
                if (!title) continue;
                events.push({
                  date: normalizeTimelineDate(event.date),
                  dateText: event.dateText,
                  kind: event.kind,
                  title,
                  description: event.description.trim(),
                  quote: verifyQuote(event.quote, text, folded),
                  sourceRef: doc.ref,
                  sourceTitle: doc.title,
                });
              }
            }
            return {
              source: {
                ref: doc.ref,
                title: doc.title,
                status: truncated ? "TRUNCATED" : "READ",
                summary: summary || null,
                eventCount: events.length,
              },
              events,
            };
          } catch {
            return {
              source: {
                ref: doc.ref,
                title: doc.title,
                status: "FAILED",
                summary: null,
                eventCount: 0,
              },
              events: [],
            };
          }
        },
      );
      if (
        readable.length &&
        perDocument.every(
          (entry) =>
            entry.source.status === "FAILED" ||
            entry.source.status === "NO_TEXT",
        )
      ) {
        throw new Error("Timeline extraction failed for every document");
      }
      const sources: CaseTimelineSource[] = [
        ...perDocument.map((entry) => entry.source),
        ...inputData.skipped.map((doc) => ({
          ref: doc.ref,
          title: doc.title,
          status: "SKIPPED" as const,
          summary: null,
          eventCount: 0,
        })),
      ];
      return {
        focus: inputData.focus,
        sources,
        events: mergeTimelineEvents(
          perDocument.flatMap((entry) => entry.events),
        ),
        summaryMaxChars: budget.summaryMaxChars,
      };
    },
  });

  const summarize = createStep({
    id: "summarize",
    inputSchema: extractedSchema,
    outputSchema: caseTimelineOutcomeSchema,
    execute: async ({ inputData }) => {
      const sources = inputData.sources as CaseTimelineSource[];
      const events = inputData.events as CaseTimelineEvent[];
      const { prompt, promptChars, omittedEvents } =
        buildTimelineSummaryUserPrompt({
          sources,
          events,
          maxChars: inputData.summaryMaxChars,
        });
      const summary = await runTimelineSummaryLlm(
        deps.provider,
        buildTimelineSummarySystemPrompt(inputData.focus),
        prompt,
      );
      const warnings = [...summary.warnings];
      if (omittedEvents) {
        warnings.push(
          `Pregled je napisan bez ${omittedEvents} događaja zbog dužine; svi događaji su u hronologiji.`,
        );
      }
      const result: CaseTimelineResult = {
        summary: summary.summary.trim(),
        events,
        openQuestions: summary.openQuestions,
        sources,
        warnings,
      };
      return {
        result,
        promptChars,
        truncated: sources.some(
          (source) =>
            source.status === "TRUNCATED" || source.status === "SKIPPED",
        ),
      };
    },
  });

  return createWorkflow({
    id: "case-timeline",
    inputSchema: caseTimelineInputSchema,
    outputSchema: caseTimelineOutcomeSchema,
  })
    .then(extract)
    .then(summarize)
    .commit();
}

/** Runs the timeline workflow and returns its outcome or throws its error. */
export async function runCaseTimelineWorkflow(
  workflow: ReturnType<typeof createCaseTimelineWorkflow>,
  inputData: CaseTimelineInput,
): Promise<CaseTimelineOutcome> {
  const run = await workflow.createRun();
  const result = await run.start({ inputData });
  if (result.status === "success" && "result" in result) {
    return result.result as CaseTimelineOutcome;
  }
  const error = "error" in result ? result.error : undefined;
  throw error instanceof Error
    ? error
    : new Error(`Case timeline workflow ended with status ${result.status}`);
}

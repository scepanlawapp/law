import { createStep, createWorkflow } from "@mastra/core/workflows";
import type { ChatModelProvider } from "@law/llm";
import {
  buildDeadlineClassificationSystemPrompt,
  buildDeadlineClassificationUserPrompt,
  excerptForClassification,
  interpretDeadlineClassification,
  runDeadlineClassificationLlm,
  type DeadlineClassification,
  type DeadlineOutcome,
} from "@law/legal-deadlines";
import { z } from "zod";

/**
 * Per-run dependencies, bound by closure (never via RequestContext) so the
 * model provider and its credentials never enter Mastra run state.
 */
export interface DeadlineDetectionWorkflowDeps {
  provider: ChatModelProvider;
}

export const deadlineDetectionInputSchema = z.object({
  documentTitle: z.string(),
  /** Latin script. */
  text: z.string().min(1),
  /** Service date the user gave (YYYY-MM-DD). */
  serviceDate: z.string().nullable(),
  /** YYYY-MM-DD (Europe/Belgrade). */
  today: z.string(),
  maxChars: z.number().int().positive(),
});

const classifiedSchema = deadlineDetectionInputSchema.extend({
  classification: z.any(),
  excerpt: z.string(),
  truncated: z.boolean(),
});

export const deadlineDetectionOutcomeSchema = z.object({
  outcome: z.any(),
  classification: z.any(),
  promptChars: z.number(),
  truncated: z.boolean(),
});

export type DeadlineDetectionInput = z.infer<
  typeof deadlineDetectionInputSchema
>;
export interface DeadlineDetectionOutcome {
  outcome: DeadlineOutcome;
  classification: DeadlineClassification;
  promptChars: number;
  /** The middle of a long document was left out. */
  truncated: boolean;
}

/**
 * Deadline from a served document: the model classifies the act (classify),
 * then `@law/legal-deadlines` picks the rule and counts the days (compute).
 * The model never produces the date.
 */
export function createDeadlineDetectionWorkflow(
  deps: DeadlineDetectionWorkflowDeps,
) {
  const classify = createStep({
    id: "classify-act",
    inputSchema: deadlineDetectionInputSchema,
    outputSchema: classifiedSchema,
    execute: async ({ inputData }) => {
      const { text, truncated } = excerptForClassification(
        inputData.text,
        inputData.maxChars,
      );
      const classification = await runDeadlineClassificationLlm(
        deps.provider,
        buildDeadlineClassificationSystemPrompt(),
        buildDeadlineClassificationUserPrompt({
          documentTitle: inputData.documentTitle,
          text,
        }),
      );
      return { ...inputData, classification, excerpt: text, truncated };
    },
  });

  const compute = createStep({
    id: "compute-deadline",
    inputSchema: classifiedSchema,
    outputSchema: deadlineDetectionOutcomeSchema,
    execute: async ({ inputData }) => {
      const classification = inputData.classification as DeadlineClassification;
      const outcome = interpretDeadlineClassification({
        classification,
        sourceText: inputData.excerpt,
        serviceDate: inputData.serviceDate,
        today: inputData.today,
      });
      return {
        outcome,
        classification,
        promptChars: inputData.excerpt.length,
        truncated: inputData.truncated,
      };
    },
  });

  return createWorkflow({
    id: "deadline-detection",
    inputSchema: deadlineDetectionInputSchema,
    outputSchema: deadlineDetectionOutcomeSchema,
  })
    .then(classify)
    .then(compute)
    .commit();
}

/** Runs the deadline workflow and returns its outcome or throws its error. */
export async function runDeadlineDetectionWorkflow(
  workflow: ReturnType<typeof createDeadlineDetectionWorkflow>,
  inputData: DeadlineDetectionInput,
): Promise<DeadlineDetectionOutcome> {
  const run = await workflow.createRun();
  const result = await run.start({ inputData });
  if (result.status === "success" && "result" in result) {
    return result.result as DeadlineDetectionOutcome;
  }
  const error = "error" in result ? result.error : undefined;
  throw error instanceof Error
    ? error
    : new Error(`Deadline workflow ended with status ${result.status}`);
}

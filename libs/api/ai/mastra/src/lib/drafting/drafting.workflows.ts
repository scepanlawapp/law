import { createStep, createWorkflow } from "@mastra/core/workflows";
import { DRAFT_DOCUMENT_TYPES } from "@law/api-interfaces";
import {
  briefResultSchema,
  buildBriefUserPrompt,
  runBriefExtractionLlm,
  type BriefDocumentFact,
  type BriefDocumentInput,
  type BriefResult,
} from "@law/brief-extraction";
import {
  buildDraftingUserPrompt,
  draftResultSchema,
  runDraftingLlm,
} from "@law/drafting";
import {
  buildDraftGroundingQueries,
  filterUsedCitations,
  formatGroundingContextBlock,
  retrieveGroundingCitations,
  type GroundingCitation,
  type GroundingSearch,
} from "@law/legal-grounding";
import type { ChatModelProvider } from "@law/llm";
import { z } from "zod";

export type DraftingStage = "EXTRACTING_FACTS" | "PREPARING_DRAFT";

export interface ExtractedBrief {
  brief: BriefResult;
  promptChars: number;
  truncated: boolean;
}

/**
 * Per-run dependencies, bound by closure (never via RequestContext) so the
 * model provider and its credentials never enter Mastra run state.
 */
export interface DraftingWorkflowDeps {
  provider: ChatModelProvider;
  /** Legal-source search already scoped to the workspace. */
  search: GroundingSearch;
  onStage?: (stage: DraftingStage) => Promise<void> | void;
  /** Called once the brief exists, before drafting (e.g. to persist it). */
  onBrief?: (result: ExtractedBrief) => Promise<void> | void;
}

const budgetSchema = z.object({
  perDocMaxChars: z.number().int().positive(),
  totalMaxChars: z.number().int().positive(),
  draftingPromptMaxChars: z.number().int().positive(),
});

const documentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  status: z.enum(["COMPLETED", "FAILED", "UNSUPPORTED"]),
  text: z.string().optional(),
});

const documentFactSchema = z.object({
  ref: z.string(),
  title: z.string(),
  subjectType: z.string(),
  subjectRole: z.string().nullable(),
  field: z.string(),
  value: z.string(),
});

const citationSchema = z.object({
  marker: z.number(),
  chunkId: z.string(),
  articleNumber: z.string().nullable(),
  sourceTitle: z.string(),
  sourceUrl: z.string(),
  snippet: z.string(),
  score: z.number(),
});

const feedbackSchema = z.object({
  previousDraft: z.string().optional(),
  reviewerNote: z.string().optional(),
});

export const documentDraftingInputSchema = z.object({
  documentType: z.enum(DRAFT_DOCUMENT_TYPES),
  /** Client facts in Latin script (conversation messages). */
  userText: z.string(),
  documents: z.array(documentSchema),
  /** Facts extracted from readable case documents (values only). */
  documentFacts: z.array(documentFactSchema).optional(),
  caseContext: z.string().nullable(),
  budget: budgetSchema,
});

export const draftRevisionInputSchema = z.object({
  brief: briefResultSchema,
  caseContext: z.string().nullable(),
  budget: budgetSchema,
  feedback: feedbackSchema.nullable(),
});

export const draftingOutcomeSchema = z.object({
  outcome: z.literal("DRAFTED"),
  brief: briefResultSchema,
  draft: draftResultSchema,
  /** Only the citations the draft actually uses. */
  citations: z.array(citationSchema),
  promptChars: z.number(),
  truncated: z.boolean(),
});

export type DocumentDraftingInput = z.infer<typeof documentDraftingInputSchema>;
export type DraftRevisionInput = z.infer<typeof draftRevisionInputSchema>;
export type DraftingOutcome = z.infer<typeof draftingOutcomeSchema> & {
  citations: GroundingCitation[];
};

/**
 * Document drafting as Mastra workflows (AI_ARCHITECTURE.md §4): code decides
 * the steps, the model fills them. The document type (chosen before the run)
 * selects the prompts through the `@law/brief-extraction` registry.
 */
export function createDraftingWorkflows(deps: DraftingWorkflowDeps) {
  const extractBrief = createStep({
    id: "extract-brief",
    inputSchema: documentDraftingInputSchema,
    outputSchema: draftRevisionInputSchema,
    execute: async ({ inputData }) => {
      await deps.onStage?.("EXTRACTING_FACTS");
      // Validated by the input schema; the cast restores strict field types.
      const documentFacts = inputData.documentFacts as
        | BriefDocumentFact[]
        | undefined;
      const { prompt, promptChars, truncated } = buildBriefUserPrompt(
        {
          userText: inputData.userText,
          documents: inputData.documents as BriefDocumentInput[],
          documentFacts,
        },
        {
          perDocMaxChars: inputData.budget.perDocMaxChars,
          totalMaxChars: inputData.budget.totalMaxChars,
        },
      );
      const brief = await runBriefExtractionLlm(
        deps.provider,
        prompt,
        inputData.documentType,
        documentFacts,
      );
      await deps.onBrief?.({ brief, promptChars, truncated });
      return {
        brief,
        caseContext: inputData.caseContext,
        budget: inputData.budget,
        feedback: null,
      };
    },
  });

  const groundAndDraft = createStep({
    id: "ground-and-draft",
    inputSchema: draftRevisionInputSchema,
    outputSchema: draftingOutcomeSchema,
    execute: async ({ inputData }) => {
      await deps.onStage?.("PREPARING_DRAFT");
      // Validated by draftRevisionInputSchema; the cast only restores strict
      // field types for projects compiled without strictNullChecks.
      const brief = inputData.brief as BriefResult;
      let citations: GroundingCitation[] = [];
      try {
        citations = await retrieveGroundingCitations(
          deps.search,
          buildDraftGroundingQueries(brief),
        );
      } catch {
        // Grounding is best-effort, as in the legacy drafting job.
        citations = [];
      }
      const context = [
        formatGroundingContextBlock(citations),
        inputData.caseContext,
      ]
        .filter(Boolean)
        .join("\n\n");
      const { prompt, promptChars, truncated } = buildDraftingUserPrompt(
        brief,
        inputData.budget.draftingPromptMaxChars,
        inputData.feedback ?? undefined,
        context,
      );
      const draft = await runDraftingLlm(
        deps.provider,
        prompt,
        brief.documentType,
      );
      return {
        outcome: "DRAFTED" as const,
        brief,
        draft,
        citations: filterUsedCitations(citations, draft.usedCitations),
        promptChars,
        truncated,
      };
    },
  });

  const documentDrafting = createWorkflow({
    id: "document-drafting",
    inputSchema: documentDraftingInputSchema,
    outputSchema: draftingOutcomeSchema,
  })
    .then(extractBrief)
    .then(groundAndDraft)
    .commit();

  const draftRevision = createWorkflow({
    id: "draft-revision",
    inputSchema: draftRevisionInputSchema,
    outputSchema: draftingOutcomeSchema,
  })
    .then(groundAndDraft)
    .commit();

  return { documentDrafting, draftRevision };
}

/** Runs a drafting workflow and returns its outcome or throws its error. */
export async function runDraftingWorkflow<TInput>(
  workflow: {
    createRun(): Promise<{
      start(args: {
        inputData: TInput;
      }): Promise<
        | { status: "success"; result: unknown }
        | { status: string; error?: unknown }
      >;
    }>;
  },
  inputData: TInput,
): Promise<DraftingOutcome> {
  const run = await workflow.createRun();
  const result = await run.start({ inputData });
  if (result.status === "success" && "result" in result) {
    return result.result as DraftingOutcome;
  }
  const error = "error" in result ? result.error : undefined;
  throw error instanceof Error
    ? error
    : new Error(`Drafting workflow ended with status ${result.status}`);
}

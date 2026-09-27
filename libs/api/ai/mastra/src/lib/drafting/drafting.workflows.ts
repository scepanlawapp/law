import { createStep, createWorkflow } from "@mastra/core/workflows";
import {
  briefResultSchema,
  buildBriefUserPrompt,
  runBriefExtractionLlm,
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

export const lawsuitDraftingInputSchema = z.object({
  /** Client facts in Latin script (conversation messages). */
  userText: z.string(),
  documents: z.array(documentSchema),
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
  outcome: z.enum(["DRAFTED", "UNSUPPORTED"]),
  brief: briefResultSchema,
  draft: draftResultSchema.nullable(),
  /** Only the citations the draft actually uses. */
  citations: z.array(citationSchema),
  promptChars: z.number(),
  truncated: z.boolean(),
});

export type LawsuitDraftingInput = z.infer<typeof lawsuitDraftingInputSchema>;
export type DraftRevisionInput = z.infer<typeof draftRevisionInputSchema>;
export type DraftingOutcome = z.infer<typeof draftingOutcomeSchema> & {
  citations: GroundingCitation[];
};

/**
 * Lawsuit drafting as Mastra workflows (AI_ARCHITECTURE.md §4): code decides
 * the steps, the model fills them. Reuses the existing prompts and schemas.
 */
export function createDraftingWorkflows(deps: DraftingWorkflowDeps) {
  const extractBrief = createStep({
    id: "extract-brief",
    inputSchema: lawsuitDraftingInputSchema,
    outputSchema: draftRevisionInputSchema,
    execute: async ({ inputData, bail }) => {
      await deps.onStage?.("EXTRACTING_FACTS");
      const { prompt, promptChars, truncated } = buildBriefUserPrompt(
        {
          userText: inputData.userText,
          documents: inputData.documents as BriefDocumentInput[],
        },
        {
          perDocMaxChars: inputData.budget.perDocMaxChars,
          totalMaxChars: inputData.budget.totalMaxChars,
        },
      );
      const brief = await runBriefExtractionLlm(deps.provider, prompt);
      await deps.onBrief?.({ brief, promptChars, truncated });
      if (brief.jobType !== "lawsuit") {
        return bail({
          outcome: "UNSUPPORTED" as const,
          brief,
          draft: null,
          citations: [],
          promptChars,
          truncated,
        });
      }
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
      let citations: GroundingCitation[] = [];
      try {
        citations = await retrieveGroundingCitations(
          deps.search,
          buildDraftGroundingQueries(inputData.brief),
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
        inputData.brief,
        inputData.budget.draftingPromptMaxChars,
        inputData.feedback ?? undefined,
        context,
      );
      const draft = await runDraftingLlm(deps.provider, prompt);
      return {
        outcome: "DRAFTED" as const,
        brief: inputData.brief,
        draft,
        citations: filterUsedCitations(citations, draft.usedCitations),
        promptChars,
        truncated,
      };
    },
  });

  const lawsuitDrafting = createWorkflow({
    id: "lawsuit-drafting",
    inputSchema: lawsuitDraftingInputSchema,
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

  return { lawsuitDrafting, draftRevision };
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

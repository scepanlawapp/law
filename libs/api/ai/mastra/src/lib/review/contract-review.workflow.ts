import { createStep, createWorkflow } from "@mastra/core/workflows";
import {
  CONTRACT_REVIEW_TYPES,
  type ContractReviewResult,
} from "@law/api-interfaces";
import {
  buildContractReviewSystemPrompt,
  buildContractReviewUserPrompt,
  buildReviewGroundingQueries,
  finalizeContractReview,
  getContractChecklist,
  runContractReviewLlm,
} from "@law/contract-review";
import {
  filterUsedCitations,
  formatGroundingContextBlock,
  retrieveGroundingCitations,
  type GroundingCitation,
  type GroundingSearch,
} from "@law/legal-grounding";
import type { ChatModelProvider } from "@law/llm";
import { z } from "zod";

/**
 * Per-run dependencies, bound by closure (never via RequestContext) so the
 * model provider and its credentials never enter Mastra run state.
 */
export interface ContractReviewWorkflowDeps {
  provider: ChatModelProvider;
  /** Legal-source search already scoped to the workspace. */
  search: GroundingSearch;
}

export const contractReviewInputSchema = z.object({
  contractType: z.enum(CONTRACT_REVIEW_TYPES),
  clientSide: z.string().nullable(),
  focus: z.string().nullable(),
  documentTitle: z.string(),
  /** Contract text in Latin script. */
  text: z.string().min(1),
  budget: z.object({ maxChars: z.number().int().positive() }),
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

const groundedSchema = contractReviewInputSchema.extend({
  citations: z.array(citationSchema),
});

export const contractReviewOutcomeSchema = z.object({
  result: z.any(),
  /** Only the citations the review actually uses. */
  citations: z.array(citationSchema),
  promptChars: z.number(),
  truncated: z.boolean(),
});

export type ContractReviewInput = z.infer<typeof contractReviewInputSchema>;
export interface ContractReviewOutcome {
  result: ContractReviewResult;
  citations: GroundingCitation[];
  promptChars: number;
  truncated: boolean;
}

/**
 * Contract review as a Mastra workflow: ground on the checklist's legal frame
 * and compliance points, then one structured review call. Read-only.
 */
export function createContractReviewWorkflow(deps: ContractReviewWorkflowDeps) {
  const ground = createStep({
    id: "ground",
    inputSchema: contractReviewInputSchema,
    outputSchema: groundedSchema,
    execute: async ({ inputData }) => {
      let citations: GroundingCitation[] = [];
      try {
        citations = await retrieveGroundingCitations(
          deps.search,
          buildReviewGroundingQueries(
            getContractChecklist(inputData.contractType),
          ),
        );
      } catch {
        // Grounding is best-effort; the review still runs without sources.
        citations = [];
      }
      return { ...inputData, citations };
    },
  });

  const review = createStep({
    id: "review",
    inputSchema: groundedSchema,
    outputSchema: contractReviewOutcomeSchema,
    execute: async ({ inputData }) => {
      const citations = inputData.citations as GroundingCitation[];
      const { prompt, promptChars, truncated } = buildContractReviewUserPrompt({
        documentTitle: inputData.documentTitle,
        text: inputData.text,
        groundingContextBlock: formatGroundingContextBlock(citations),
        maxChars: inputData.budget.maxChars,
      });
      const output = await runContractReviewLlm(
        deps.provider,
        buildContractReviewSystemPrompt({
          checklist: getContractChecklist(inputData.contractType),
          clientSide: inputData.clientSide,
          focus: inputData.focus,
        }),
        prompt,
      );
      const { result, usedMarkers } = finalizeContractReview(
        output,
        citations.map((citation) => citation.marker),
      );
      return {
        result,
        citations: filterUsedCitations(citations, usedMarkers),
        promptChars,
        truncated,
      };
    },
  });

  return createWorkflow({
    id: "contract-review",
    inputSchema: contractReviewInputSchema,
    outputSchema: contractReviewOutcomeSchema,
  })
    .then(ground)
    .then(review)
    .commit();
}

/** Runs the review workflow and returns its outcome or throws its error. */
export async function runContractReviewWorkflow(
  workflow: ReturnType<typeof createContractReviewWorkflow>,
  inputData: ContractReviewInput,
): Promise<ContractReviewOutcome> {
  const run = await workflow.createRun();
  const result = await run.start({ inputData });
  if (result.status === "success" && "result" in result) {
    return result.result as ContractReviewOutcome;
  }
  const error = "error" in result ? result.error : undefined;
  throw error instanceof Error
    ? error
    : new Error(`Contract review workflow ended with status ${result.status}`);
}

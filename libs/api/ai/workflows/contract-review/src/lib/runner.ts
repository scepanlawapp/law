import type {
  ContractIssueRisk,
  ContractReviewResult,
} from "@law/api-interfaces";
import type { ChatModelProvider } from "@law/llm";
import { z } from "zod";
import {
  contractReviewLlmSchema,
  type ContractReviewLlmOutput,
} from "./schema";

export async function runContractReviewLlm(
  provider: ChatModelProvider,
  systemPrompt: string,
  userPrompt: string,
): Promise<ContractReviewLlmOutput> {
  return provider.completeStructured({
    schema:
      contractReviewLlmSchema as unknown as z.ZodType<ContractReviewLlmOutput>,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
}

const RISK_ORDER: Record<ContractIssueRisk, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

/**
 * Keeps only citation markers that exist in this run's grounding set, orders
 * issues by risk (compliance first within a level), and returns the markers
 * actually used.
 */
export function finalizeContractReview(
  output: ContractReviewLlmOutput,
  availableMarkers: readonly number[],
): { result: ContractReviewResult; usedMarkers: number[] } {
  const available = new Set(availableMarkers);
  const issues = output.issues
    .map((issue) => ({
      ...issue,
      citations: [...new Set(issue.citations)].filter((marker) =>
        available.has(marker),
      ),
    }))
    .sort(
      (left, right) =>
        RISK_ORDER[left.risk] - RISK_ORDER[right.risk] ||
        Number(left.category !== "COMPLIANCE") -
          Number(right.category !== "COMPLIANCE"),
    );
  const used = new Set<number>();
  for (const marker of output.usedCitations) {
    if (available.has(marker)) used.add(marker);
  }
  for (const issue of issues)
    issue.citations.forEach((marker) => used.add(marker));
  return {
    result: {
      summary: output.summary.trim(),
      keyTerms: output.keyTerms.filter((term) => term.value.trim()),
      issues,
      missingClauses: output.missingClauses,
      warnings: output.warnings,
    },
    usedMarkers: [...used].sort((left, right) => left - right),
  };
}

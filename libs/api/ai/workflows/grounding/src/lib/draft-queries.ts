import type { BriefResult } from "@law/brief-extraction";

const MIN_QUERY_LENGTH = 3;

export function buildDraftGroundingQueries(brief: BriefResult): string[] {
  const queries: string[] = [];

  for (const legalBasis of brief.legalBasis) {
    if (legalBasis?.trim()) queries.push(legalBasis.trim());
  }
  if (brief.factualDescription?.trim()) {
    queries.push(brief.factualDescription.trim());
  }
  const claimSummary = [brief.jobType, brief.reliefSought]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ")
    .trim();
  if (claimSummary) queries.push(claimSummary);

  return dedupe(queries).filter((query) => query.length >= MIN_QUERY_LENGTH);
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

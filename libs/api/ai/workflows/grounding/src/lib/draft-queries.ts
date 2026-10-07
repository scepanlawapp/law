import { getDocumentType, type BriefResult } from "@law/brief-extraction";

const MIN_QUERY_LENGTH = 3;

export function buildDraftGroundingQueries(brief: BriefResult): string[] {
  const queries: string[] = [];

  for (const legalBasis of brief.legalBasis) {
    if (legalBasis?.trim()) queries.push(legalBasis.trim());
  }
  if (brief.factualDescription?.trim()) {
    queries.push(brief.factualDescription.trim());
  }
  // The document type plus what it asks for (relief, appeal grounds, …).
  const type = getDocumentType(brief.documentType);
  const purposeKey = type.fields.find((field) => field.caseName)?.key;
  const purpose = brief.fields.find((field) => field.key === purposeKey)?.value;
  const claimSummary = [type.label, purpose]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ")
    .trim();
  if (claimSummary) queries.push(claimSummary);

  return dedupe(queries).filter((query) => query.length >= MIN_QUERY_LENGTH);
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

import { CaseSummary } from "@law/api-interfaces";

export function clientIdForCase(
  cases: CaseSummary[],
  caseId: string,
): string | undefined {
  return cases.find((item) => item.id === caseId)?.client.id;
}

export function compatibleCaseId(
  cases: CaseSummary[],
  caseId: string,
  clientIds: string[],
): string {
  const caseItem = cases.find((item) => item.id === caseId);
  return caseItem && !clientIds.includes(caseItem.client.id) ? "" : caseId;
}

export function withCaseClient(
  cases: CaseSummary[],
  caseId: string,
  clientIds: string[],
): string[] {
  const clientId = clientIdForCase(cases, caseId);
  return clientId ? [...new Set([...clientIds, clientId])] : clientIds;
}

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
  clientId: string,
): string {
  const caseItem = cases.find((item) => item.id === caseId);
  return caseItem && caseItem.client.id !== clientId ? "" : caseId;
}

export function eventClientIds(clientId: string): string[] {
  return clientId ? [clientId] : [];
}

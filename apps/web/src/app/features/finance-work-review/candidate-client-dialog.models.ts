import { ClientSummary } from "@law/api-interfaces";

export interface CandidateClientDialogContext {
  candidateTitle: string;
  clients: ClientSummary[];
}

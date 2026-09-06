export type WorkflowName =
  | "triage"
  | "brief-extraction"
  | "template-retrieval"
  | "drafting"
  | "evaluation"
  | "review";

export type WorkflowStatus = "queued" | "running" | "completed" | "failed";

export interface WorkflowAuthorizationContext {
  actorId: string;
  workspaceId: string;
  caseId?: string;
}

export interface WorkflowRequest<TInput> {
  workflow: WorkflowName;
  correlationId: string;
  authorization: WorkflowAuthorizationContext;
  input: TInput;
}

export interface WorkflowResult<TOutput> {
  workflow: WorkflowName;
  correlationId: string;
  status: WorkflowStatus;
  output?: TOutput;
  errorCode?: string;
}

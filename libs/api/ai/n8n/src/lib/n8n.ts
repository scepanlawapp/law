import type { WorkflowRequest, WorkflowResult } from "@law/contracts";

export interface N8nWorkflowClient {
  start<TInput, TOutput>(
    request: WorkflowRequest<TInput>,
  ): Promise<WorkflowResult<TOutput>>;
}

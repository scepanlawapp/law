import { WorkflowName } from "@law/contracts";

/**
 * Lean job payload persisted to Redis: processors reload the actual
 * workflow input from `WorkflowJob.input` in Postgres, never large text.
 */
export interface WorkflowJobPayload {
  workspaceId: string;
  sessionId: string;
  jobId: string;
  correlationId: string;
  messageId?: string;
}

export interface WorkflowQueuePort {
  enqueue(
    name: WorkflowName,
    jobId: string,
    payload: WorkflowJobPayload,
  ): Promise<void>;
}

export const WORKFLOW_QUEUE_NAME = "workflow";
export const WORKFLOW_QUEUE_PORT = "WORKFLOW_QUEUE_PORT";

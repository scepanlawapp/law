import { Injectable, Logger } from "@nestjs/common";
import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { WorkflowName } from "@law/contracts";
import {
  TenantConnectionManager,
  TenantContext,
  TenantContextService,
  TenantRegistryService,
} from "@law/core";
import { WorkspaceRole } from "@law/api-interfaces";
import { ChatEventBus } from "./chat.events";
import { toJob } from "./chat.mappers";
import {
  WORKFLOW_QUEUE_NAME,
  WorkflowJobPayload,
} from "./workflow-queue.types";
import { WorkflowRunner } from "./workflow.runner";

/**
 * BullMQ consumer for the `workflow` queue. Delegates to `WorkflowRunner` for
 * the actual triage/brief-extraction/drafting logic; a thrown error here is a
 * retryable (infra) failure and lets BullMQ retry with backoff. Terminal
 * (LLM/zod) failures are caught inside `WorkflowRunner` and recorded as
 * `COMPLETED`/`FAILED` without rethrowing.
 */
@Injectable()
@Processor(WORKFLOW_QUEUE_NAME)
export class WorkflowProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkflowProcessor.name);

  constructor(
    private readonly runner: WorkflowRunner,
    private readonly events: ChatEventBus,
    private readonly tenantRegistry: TenantRegistryService,
    private readonly connectionManager: TenantConnectionManager,
    private readonly tenantContextService: TenantContextService,
  ) {
    super();
  }

  async process(job: Job<WorkflowJobPayload>): Promise<void> {
    const { tenant } = await this.tenantRegistry.resolveTenantForWorkspace(
      job.data.workspaceId,
    );
    const tenantPrisma = this.connectionManager.getTenantClient(
      tenant.schemaName,
    );
    const context: TenantContext = {
      userId: "system-workflow",
      workspaceId: job.data.workspaceId,
      tenantId: tenant.id,
      schemaName: tenant.schemaName,
      role: WorkspaceRole.ADMIN,
      storagePrefix: tenant.storagePrefix ?? `tenants/${tenant.id}/`,
      prisma: tenantPrisma,
    };
    await this.tenantContextService.run(context, () =>
      this.runner.run(job.name as WorkflowName, job.data),
    );
  }

  @OnWorkerEvent("failed")
  async onFailed(
    job: Job<WorkflowJobPayload> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job) return;
    const attemptsMade = job.attemptsMade ?? 0;
    const maxAttempts = job.opts?.attempts ?? 1;
    if (attemptsMade < maxAttempts) return; // more retries scheduled by BullMQ

    try {
      const { tenant } = await this.tenantRegistry.resolveTenantForWorkspace(
        job.data.workspaceId,
      );
      const tenantPrisma = this.connectionManager.getTenantClient(
        tenant.schemaName,
      );
      const record = await tenantPrisma.workflowJob.update({
        where: { id: job.data.jobId },
        data: { status: "FAILED", errorCode: "WORKFLOW_RETRIES_EXHAUSTED" },
      });
      this.events.emit({
        type: "job.updated",
        sessionId: job.data.sessionId,
        createdAt: record.updatedAt.toISOString(),
        job: toJob(record),
      });
      this.events.emit({
        type: "error",
        sessionId: job.data.sessionId,
        createdAt: new Date().toISOString(),
        error: `Workflow ${job.name} failed after ${attemptsMade} attempt(s): ${error.message}`,
      });
    } catch (updateError) {
      this.logger.error(
        `Failed to record final failure for job ${job.data.jobId}: ${
          updateError instanceof Error ? updateError.message : updateError
        }`,
      );
    }
  }
}

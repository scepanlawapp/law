import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { WorkflowName } from "@law/contracts";
import { ChatRuntimeConfig } from "./chat.config";
import {
  WORKFLOW_QUEUE_NAME,
  WorkflowJobPayload,
  WorkflowQueuePort,
} from "./workflow-queue.types";

/** Production queue: enqueues onto the BullMQ `workflow` queue backed by Redis. */
@Injectable()
export class WorkflowQueueService implements WorkflowQueuePort {
  constructor(
    @InjectQueue(WORKFLOW_QUEUE_NAME)
    private readonly queue: Queue<WorkflowJobPayload>,
    private readonly config: ChatRuntimeConfig,
  ) {}

  async enqueue(
    name: WorkflowName,
    jobId: string,
    payload: WorkflowJobPayload,
  ): Promise<void> {
    await this.queue.add(name, payload, {
      jobId,
      attempts: this.config.workflowQueueAttempts,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }
}

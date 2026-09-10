import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { BullModule } from "@nestjs/bullmq";
import { memoryStorage } from "multer";
import { AuthModule } from "@law/auth";
import { ChatController } from "./chat.controller";
import { ChatRuntimeConfig } from "./chat.config";
import { ChatEventBus } from "./chat.events";
import { ChatService } from "./chat.service";
import { ChatStorageService } from "./chat.storage";
import { WorkflowQueueService } from "./workflow-queue.service";
import { WorkflowProcessor } from "./workflow.processor";
import { WorkflowRunner } from "./workflow.runner";
import { WORKFLOW_QUEUE_NAME, WORKFLOW_QUEUE_PORT } from "./workflow-queue.types";

@Module({
  imports: [
    AuthModule,
    MulterModule.register({ storage: memoryStorage() }),
    BullModule.forRootAsync({
      useFactory: () => {
        const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
            // BullMQ requires this; also avoids eager connection attempts at boot.
            maxRetriesPerRequest: null,
            lazyConnect: true,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: WORKFLOW_QUEUE_NAME }),
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatEventBus,
    ChatStorageService,
    ChatRuntimeConfig,
    WorkflowRunner,
    WorkflowProcessor,
    { provide: WORKFLOW_QUEUE_PORT, useClass: WorkflowQueueService },
  ],
  exports: [ChatService],
})
export class ChatModule {}

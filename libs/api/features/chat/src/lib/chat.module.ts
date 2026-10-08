import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { BullModule } from "@nestjs/bullmq";
import { memoryStorage } from "multer";
import { AuthModule } from "@law/auth";
import { QueueRootModule } from "@law/core";
import { FileStorageModule } from "@law/file-storage";
import { LegalKnowledgeModule } from "@law/legal-knowledge";
import { CasesModule } from "@law/cases";
import { ClientsModule } from "@law/clients";
import { ActivitiesTasksDeadlinesModule } from "@law/activities-tasks-deadlines";
import { WorkspaceDocumentsModule } from "@law/workspace-documents";
import { AgentTurnRunner } from "./agent-turn.runner";
import { AssistantActionsService } from "./assistant-actions.service";
import { AssistantContextBuilder } from "./assistant-context.builder";
import { ConversationSummaryService } from "./conversation-summary.service";
import { AssistantDraftingService } from "./assistant-drafting.service";
import { AssistantContractReviewService } from "./assistant-contract-review.service";
import { AssistantCaseTimelineService } from "./assistant-case-timeline.service";
import { AssistantDeadlineDetectionService } from "./assistant-deadline-detection.service";
import { AssistantOfficeReadsService } from "./assistant-office-reads.service";
import { AssistantDocumentReadsService } from "./assistant-document-reads.service";
import { ChatDocumentPromotionService } from "./chat-document-promotion.service";
import { AssistantToolsAdapter } from "./assistant-tools.adapter";
import { ChatController } from "./chat.controller";
import { ChatRuntimeConfig } from "./chat.config";
import { ChatEventBus } from "./chat.events";
import { ChatService } from "./chat.service";
import { MatterLinkService } from "./matter-link.service";
import { WorkflowQueueService } from "./workflow-queue.service";
import { WorkflowProcessor } from "./workflow.processor";
import { WorkflowRunner } from "./workflow.runner";
import {
  WORKFLOW_QUEUE_NAME,
  WORKFLOW_QUEUE_PORT,
} from "./workflow-queue.types";

@Module({
  imports: [
    AuthModule,
    LegalKnowledgeModule,
    CasesModule,
    ClientsModule,
    ActivitiesTasksDeadlinesModule,
    WorkspaceDocumentsModule,
    FileStorageModule,
    MulterModule.register({ storage: memoryStorage() }),
    QueueRootModule,
    BullModule.registerQueue({ name: WORKFLOW_QUEUE_NAME }),
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    MatterLinkService,
    ChatEventBus,
    ChatRuntimeConfig,
    WorkflowRunner,
    WorkflowProcessor,
    AssistantContextBuilder,
    AssistantToolsAdapter,
    AssistantDraftingService,
    AssistantContractReviewService,
    AssistantCaseTimelineService,
    AssistantDeadlineDetectionService,
    AssistantActionsService,
    AssistantOfficeReadsService,
    AssistantDocumentReadsService,
    ChatDocumentPromotionService,
    ConversationSummaryService,
    AgentTurnRunner,
    { provide: WORKFLOW_QUEUE_PORT, useClass: WorkflowQueueService },
  ],
  exports: [ChatService],
})
export class ChatModule {}

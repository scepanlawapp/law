import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QueueRootModule } from "@law/core";
import { FileStorageModule } from "@law/file-storage";
import { ContentBytesReader } from "./content-bytes.reader";
import { DocumentContentEvents } from "./document-content.events";
import { DocumentContentService } from "./document-content.service";
import { DocumentIngestionConfig } from "./document-ingestion.config";
import { DocumentIngestionPipeline } from "./document-ingestion.pipeline";
import { DocumentIngestionProcessor } from "./document-ingestion.processor";
import {
  documentEmbeddingProvider,
  documentModelProvider,
} from "./document-ingestion.providers";
import { DocumentIngestionQueue } from "./document-ingestion.queue";
import { DOCUMENT_INGEST_QUEUE } from "./document-ingestion.types";

@Module({
  imports: [
    QueueRootModule,
    BullModule.registerQueue({ name: DOCUMENT_INGEST_QUEUE }),
    FileStorageModule,
  ],
  providers: [
    ContentBytesReader,
    DocumentContentService,
    DocumentIngestionQueue,
    DocumentIngestionConfig,
    DocumentContentEvents,
    documentEmbeddingProvider,
    documentModelProvider,
    DocumentIngestionPipeline,
    DocumentIngestionProcessor,
  ],
  exports: [
    ContentBytesReader,
    DocumentContentService,
    DocumentIngestionQueue,
    DocumentContentEvents,
  ],
})
export class DocumentIngestionModule {}

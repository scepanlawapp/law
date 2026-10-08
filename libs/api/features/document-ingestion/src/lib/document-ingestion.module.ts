import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QueueRootModule } from "@law/core";
import { FileStorageModule } from "@law/file-storage";
import { ContentBytesReader } from "./content-bytes.reader";
import { DocumentContentService } from "./document-content.service";
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
  ],
  exports: [ContentBytesReader, DocumentContentService, DocumentIngestionQueue],
})
export class DocumentIngestionModule {}

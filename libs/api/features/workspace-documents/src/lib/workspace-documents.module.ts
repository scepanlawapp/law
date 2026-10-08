import { DocumentFoldersService } from "./document-folders.service";
import { Module } from "@nestjs/common";
import { FileStorageModule } from "@law/file-storage";
import { DocumentIngestionModule } from "@law/document-ingestion";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";

@Module({
  imports: [FileStorageModule, DocumentIngestionModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentFoldersService],
  exports: [DocumentsService],
})
export class WorkspaceDocumentsModule {}

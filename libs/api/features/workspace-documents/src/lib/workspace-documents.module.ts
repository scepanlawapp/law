import { DocumentFoldersService } from "./document-folders.service";
import { Module } from "@nestjs/common";
import { FileStorageModule } from "@law/file-storage";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { DocumentTextService } from "./document-text.service";

@Module({
  imports: [FileStorageModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentTextService, DocumentFoldersService],
  exports: [DocumentsService, DocumentTextService],
})
export class WorkspaceDocumentsModule {}

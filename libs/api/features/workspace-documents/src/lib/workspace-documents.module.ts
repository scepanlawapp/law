import { Module } from "@nestjs/common";
import { FileStorageModule } from "@law/file-storage";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";

@Module({
  imports: [FileStorageModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class WorkspaceDocumentsModule {}

import { Module } from "@nestjs/common";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { LegalDocumentStorage } from "./documents.storage";

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, LegalDocumentStorage],
  exports: [DocumentsService],
})
export class DocumentsModule {}

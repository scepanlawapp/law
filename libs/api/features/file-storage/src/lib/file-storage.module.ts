import { Module } from "@nestjs/common";
import { ChatAttachmentStorage } from "./chat-attachment.storage";
import { FileService } from "./file.service";
import { FileStorageConfig } from "./file-storage.config";
import { LocalStorageAdapter } from "./local-storage.adapter";
import { StorageRouter } from "./storage.router";

@Module({
  providers: [
    FileStorageConfig,
    LocalStorageAdapter,
    StorageRouter,
    FileService,
    ChatAttachmentStorage,
  ],
  exports: [
    FileService,
    StorageRouter,
    LocalStorageAdapter,
    FileStorageConfig,
    ChatAttachmentStorage,
  ],
})
export class FileStorageModule {}

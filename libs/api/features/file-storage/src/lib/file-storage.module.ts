import { Module } from "@nestjs/common";
import { FileService } from "./file.service";
import { FileStorageConfig } from "./file-storage.config";
import { LocalStorageAdapter } from "./local-storage.adapter";
import { StorageRouter } from "./storage.router";

@Module({
  providers: [FileStorageConfig, LocalStorageAdapter, StorageRouter, FileService],
  exports: [FileService, StorageRouter, LocalStorageAdapter, FileStorageConfig],
})
export class FileStorageModule {}

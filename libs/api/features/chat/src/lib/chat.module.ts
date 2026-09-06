import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { AuthModule } from "@law/auth";
import { ChatController } from "./chat.controller";
import { ChatRuntimeConfig } from "./chat.config";
import { ChatEventBus } from "./chat.events";
import { ChatService } from "./chat.service";
import { ChatStorageService } from "./chat.storage";

@Module({
  imports: [AuthModule, MulterModule.register({ storage: memoryStorage() })],
  controllers: [ChatController],
  providers: [ChatService, ChatEventBus, ChatStorageService, ChatRuntimeConfig],
  exports: [ChatService],
})
export class ChatModule {}

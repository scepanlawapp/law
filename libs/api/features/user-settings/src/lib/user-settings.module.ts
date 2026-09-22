import { Module } from "@nestjs/common";
import { FileStorageModule } from "@law/file-storage";
import { UserSettingsController } from "./user-settings.controller";
import { UserSettingsService } from "./user-settings.service";

@Module({
  imports: [FileStorageModule],
  controllers: [UserSettingsController],
  providers: [UserSettingsService],
})
export class UserSettingsModule {}

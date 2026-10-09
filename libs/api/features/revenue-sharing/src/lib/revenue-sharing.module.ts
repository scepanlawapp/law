import { Module } from "@nestjs/common";
import { RevenueSharingController } from "./revenue-sharing.controller";
import { RevenueSharingService } from "./revenue-sharing.service";
@Module({
  controllers: [RevenueSharingController],
  providers: [RevenueSharingService],
  exports: [RevenueSharingService],
})
export class RevenueSharingModule {}

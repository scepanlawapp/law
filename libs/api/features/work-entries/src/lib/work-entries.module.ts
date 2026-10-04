import { Module } from "@nestjs/common";
import { WorkEntriesController } from "./work-entries.controller";
import { WorkEntriesService } from "./work-entries.service";

@Module({
  controllers: [WorkEntriesController],
  providers: [WorkEntriesService],
  exports: [WorkEntriesService],
})
export class WorkEntriesModule {}

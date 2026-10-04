import { Module } from "@nestjs/common";
import { WorkEntriesController } from "./work-entries.controller";
import { WorkEntriesService } from "./work-entries.service";
import { WorkEntrySourcesService } from "./work-entry-sources.service";

@Module({
  controllers: [WorkEntriesController],
  providers: [WorkEntriesService, WorkEntrySourcesService],
  exports: [WorkEntriesService, WorkEntrySourcesService],
})
export class WorkEntriesModule {}

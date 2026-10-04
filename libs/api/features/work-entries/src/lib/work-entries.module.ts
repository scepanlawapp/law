import { Module } from "@nestjs/common";
import { BillingSetupController } from "./billing-setup.controller";
import { BillingSetupService } from "./billing-setup.service";
import { WorkCaptureService } from "./work-capture.service";
import { WorkEntriesController } from "./work-entries.controller";
import { WorkEntriesService } from "./work-entries.service";
import { WorkEntrySourcesService } from "./work-entry-sources.service";

@Module({
  controllers: [WorkEntriesController, BillingSetupController],
  providers: [
    BillingSetupService,
    WorkCaptureService,
    WorkEntriesService,
    WorkEntrySourcesService,
  ],
  exports: [BillingSetupService, WorkEntriesService, WorkEntrySourcesService],
})
export class WorkEntriesModule {}

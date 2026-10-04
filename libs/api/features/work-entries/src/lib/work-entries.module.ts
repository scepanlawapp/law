import { Module } from "@nestjs/common";
import { NotificationsModule } from "@law/notifications";
import { BillingSetupController } from "./billing-setup.controller";
import { BillingSetupService } from "./billing-setup.service";
import { RetainerUsageService } from "./retainer-usage.service";
import { WorkCaptureService } from "./work-capture.service";
import { WorkEntriesController } from "./work-entries.controller";
import { WorkEntriesService } from "./work-entries.service";
import { WorkEntrySourcesService } from "./work-entry-sources.service";

@Module({
  imports: [NotificationsModule],
  controllers: [WorkEntriesController, BillingSetupController],
  providers: [
    BillingSetupService,
    RetainerUsageService,
    WorkCaptureService,
    WorkEntriesService,
    WorkEntrySourcesService,
  ],
  exports: [
    BillingSetupService,
    RetainerUsageService,
    WorkEntriesService,
    WorkEntrySourcesService,
  ],
})
export class WorkEntriesModule {}

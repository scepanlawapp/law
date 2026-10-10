import { Module } from "@nestjs/common";
import { NotificationsModule } from "@law/notifications";
import { LegalKnowledgeModule } from "@law/legal-knowledge";
import { PricingSuggestionController } from "./pricing-suggestion.controller";
import { PricingSuggestionService } from "./pricing-suggestion.service";
import { PricingContextResolver } from "./pricing-context.resolver";
import { BillingSetupController } from "./billing-setup.controller";
import { BillingSetupService } from "./billing-setup.service";
import { RetainerUsageService } from "./retainer-usage.service";
import { WorkCaptureService } from "./work-capture.service";
import { WorkEntriesController } from "./work-entries.controller";
import { WorkEntriesService } from "./work-entries.service";
import { WorkEntrySourcesService } from "./work-entry-sources.service";

@Module({
  imports: [NotificationsModule, LegalKnowledgeModule],
  controllers: [
    WorkEntriesController,
    BillingSetupController,
    PricingSuggestionController,
  ],
  providers: [
    PricingSuggestionService,
    PricingContextResolver,
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

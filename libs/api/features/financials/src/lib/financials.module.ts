import { Module } from "@nestjs/common";
import { FinancialsController } from "./financials.controller";
import { FinancialsService } from "./financials.service";
import { InvoiceNumberingService } from "./invoice-numbering.service";
import { OrganizationSettingsController } from "./organization-settings.controller";
import { OrganizationSettingsService } from "./organization-settings.service";

@Module({
  controllers: [FinancialsController, OrganizationSettingsController],
  providers: [
    FinancialsService,
    InvoiceNumberingService,
    OrganizationSettingsService,
  ],
  exports: [FinancialsService, InvoiceNumberingService],
})
export class FinancialsModule {}

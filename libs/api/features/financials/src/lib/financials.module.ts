import { Module } from "@nestjs/common";
import { FinancialsController } from "./financials.controller";
import { FinancialsService } from "./financials.service";
import { InvoiceNumberingService } from "./invoice-numbering.service";
import { OrganizationSettingsController } from "./organization-settings.controller";
import { OrganizationSettingsService } from "./organization-settings.service";
import { SefApiClient } from "./sef-api.client";
import { SefInvoiceValidator } from "./sef-invoice-validator";
import { SefSecretService } from "./sef-secret.service";
import { SefSubmissionService } from "./sef-submission.service";
import { SefUblBuilder } from "./sef-ubl-builder";

@Module({
  controllers: [FinancialsController, OrganizationSettingsController],
  providers: [
    FinancialsService,
    InvoiceNumberingService,
    OrganizationSettingsService,
    SefApiClient,
    SefInvoiceValidator,
    SefSecretService,
    SefSubmissionService,
    SefUblBuilder,
  ],
  exports: [FinancialsService, InvoiceNumberingService, SefSubmissionService],
})
export class FinancialsModule {}

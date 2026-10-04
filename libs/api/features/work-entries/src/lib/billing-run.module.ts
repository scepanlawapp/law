import { Module } from "@nestjs/common";
import { FinancialsModule } from "@law/financials";
import { BillingReportsController } from "./billing-reports.controller";
import { MonthEndRunService } from "./month-end-run.service";
import { ProfitabilityService } from "./profitability.service";
import { WorkEntriesModule } from "./work-entries.module";

/**
 * Billing run and reports. Separate from WorkEntriesModule because it needs
 * FinancialsModule, and WorkEntriesModule must stay free of it.
 */
@Module({
  imports: [WorkEntriesModule, FinancialsModule],
  controllers: [BillingReportsController],
  providers: [MonthEndRunService, ProfitabilityService],
  exports: [MonthEndRunService, ProfitabilityService],
})
export class BillingRunModule {}

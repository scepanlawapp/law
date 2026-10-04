import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import { WorkspaceAccess, WorkspaceAccessGuard } from "@law/core";
import { MonthEndRunService } from "./month-end-run.service";
import { ProfitabilityService } from "./profitability.service";
import { RetainerUsageService } from "./retainer-usage.service";

// Role checks (owner only for the month end, owner/admin for profitability) live in MonthEndRunService.
@Controller("billing")
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess()
export class BillingReportsController {
  constructor(
    private readonly monthEnd: MonthEndRunService,
    private readonly profitability: ProfitabilityService,
    private readonly usage: RetainerUsageService,
  ) {}

  @Get("retainers/usage")
  listUsage(@Query("month") month: string) {
    return this.usage.listUsageForViewer(month);
  }

  @Get("clients/:clientId/usage")
  clientUsage(
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Query("month") month: string,
  ) {
    return this.usage.usageForViewer(clientId, month);
  }

  @Get("profitability")
  profitabilityReport(@Query("from") from: string, @Query("to") to: string) {
    return this.profitability.report(from, to);
  }

  @Get("month-end/:month/precheck")
  precheck(@Param("month") month: string) {
    return this.monthEnd.precheck(month);
  }

  @Post("month-end/:month/run")
  @HttpCode(200)
  run(@Param("month") month: string) {
    return this.monthEnd.run(month);
  }
}

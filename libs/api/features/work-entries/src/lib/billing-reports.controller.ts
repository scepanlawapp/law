import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import { WorkspaceAccess, WorkspaceAccessGuard } from "@law/core";
import { MonthEndRunService } from "./month-end-run.service";

// Role checks (owner only for the month end) live in MonthEndRunService.
@Controller("billing")
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess()
export class BillingReportsController {
  constructor(private readonly monthEnd: MonthEndRunService) {}

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

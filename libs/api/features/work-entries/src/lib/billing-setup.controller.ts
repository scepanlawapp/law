import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import { WorkspaceAccess, WorkspaceAccessGuard } from "@law/core";
import {
  CreateServiceCategoryDto,
  CreateUserRateDto,
  RateQueryDto,
  RetainerAgreementDto,
  UpdateServiceCategoryDto,
  UpdateWorkspaceBillingConfigDto,
  UpsertClientBillingProfileDto,
} from "./billing-setup.dto";
import { BillingSetupService } from "./billing-setup.service";

// Role checks (who may read or write what) live in BillingSetupService.
@Controller("billing-setup")
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess()
export class BillingSetupController {
  constructor(private readonly billingSetup: BillingSetupService) {}

  @Get("categories")
  listCategories() {
    return this.billingSetup.listCategories();
  }

  @Post("categories")
  createCategory(@Body() body: CreateServiceCategoryDto) {
    return this.billingSetup.createCategory(body);
  }

  @Patch("categories/:id")
  updateCategory(
    @Param("id") id: string,
    @Body() body: UpdateServiceCategoryDto,
  ) {
    return this.billingSetup.updateCategory(id, body);
  }

  @Get("clients/:clientId/retainers")
  listRetainers(@Param("clientId") clientId: string) {
    return this.billingSetup.listRetainers(clientId);
  }

  @Post("clients/:clientId/retainers")
  createRetainer(
    @Param("clientId") clientId: string,
    @Body() body: RetainerAgreementDto,
  ) {
    return this.billingSetup.createRetainer(clientId, body);
  }

  @Patch("retainers/:id")
  updateRetainer(@Param("id") id: string, @Body() body: RetainerAgreementDto) {
    return this.billingSetup.updateRetainer(id, body);
  }

  @Post("retainers/:id/deactivate")
  @HttpCode(200)
  deactivateRetainer(@Param("id") id: string) {
    return this.billingSetup.deactivateRetainer(id);
  }

  @Get("clients/:clientId/profile")
  getProfile(@Param("clientId") clientId: string) {
    return this.billingSetup.getProfile(clientId);
  }

  @Put("clients/:clientId/profile")
  upsertProfile(
    @Param("clientId") clientId: string,
    @Body() body: UpsertClientBillingProfileDto,
  ) {
    return this.billingSetup.upsertProfile(clientId, body);
  }

  @Get("rates")
  listRates(@Query() query: RateQueryDto) {
    return this.billingSetup.listRates(query.userId);
  }

  @Post("rates")
  createRate(@Body() body: CreateUserRateDto) {
    return this.billingSetup.createRate(body);
  }

  @Get("workspace")
  getWorkspaceConfig() {
    return this.billingSetup.getWorkspaceConfig();
  }

  @Put("workspace")
  updateWorkspaceConfig(@Body() body: UpdateWorkspaceBillingConfigDto) {
    return this.billingSetup.updateWorkspaceConfig(body);
  }
}

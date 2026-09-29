import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import { WorkspaceAccess, WorkspaceAccessGuard } from "@law/core";
import {
  BillableWorkQueryDto,
  CreatePriceSourceDto,
  CreateStatementDto,
  ExternalInvoiceDto,
  AppendPriceSourceVersionDto,
  SendStatementDto,
  UpdateStatementDto,
} from "./financials.dto";
import { FinancialsService } from "./financials.service";

@Controller("financials")
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess()
export class FinancialsController {
  constructor(private readonly financials: FinancialsService) {}

  @Get("billable-work")
  billableWork(@Query() query: BillableWorkQueryDto) {
    return this.financials.listBillableWork(query);
  }

  @Get("price-sources")
  priceSources() {
    return this.financials.listPriceSources();
  }

  @Post("price-sources")
  createPriceSource(@Body() body: CreatePriceSourceDto) {
    return this.financials.createPriceSource(body);
  }

  @Post("price-sources/:id/versions")
  appendPriceSourceVersion(
    @Param("id") id: string,
    @Body() body: AppendPriceSourceVersionDto,
  ) {
    return this.financials.appendPriceSourceVersion(id, body);
  }

  @Get("price-sources/:id/versions/:versionId")
  priceSourceVersion(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
  ) {
    return this.financials.priceSourceVersion(id, versionId);
  }

  @Get("price-sources/:id/versions")
  priceSourceVersions(@Param("id") id: string) {
    return this.financials.listPriceSourceVersions(id);
  }

  @Get("statements")
  statements() {
    return this.financials.listStatements();
  }

  @Post("statements")
  createStatement(@Body() body: CreateStatementDto) {
    return this.financials.createStatement(body);
  }

  @Get("statements/:id")
  statement(@Param("id") id: string) {
    return this.financials.getStatement(id);
  }

  @Patch("statements/:id")
  updateStatement(@Param("id") id: string, @Body() body: UpdateStatementDto) {
    return this.financials.updateStatement(id, body);
  }

  @Delete("statements/:id")
  deleteStatement(@Param("id") id: string) {
    return this.financials.deleteStatement(id);
  }

  @Post("statements/:id/send")
  sendStatement(@Param("id") id: string, @Body() body: SendStatementDto) {
    return this.financials.sendStatement(id, body);
  }

  @Post("statements/:id/void")
  voidStatement(@Param("id") id: string) {
    return this.financials.voidStatement(id);
  }

  @Patch("statements/:id/external-invoice")
  linkExternalInvoice(
    @Param("id") id: string,
    @Body() body: ExternalInvoiceDto,
  ) {
    return this.financials.linkExternalInvoice(id, body);
  }
}

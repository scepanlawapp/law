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
  CreateInvoiceDto,
  ExternalInvoiceDto,
  AppendPriceSourceVersionDto,
  SendInvoiceDto,
  UpdateInvoiceDto,
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

  @Get("invoices")
  invoices() {
    return this.financials.listInvoices();
  }

  @Post("invoices")
  createInvoice(@Body() body: CreateInvoiceDto) {
    return this.financials.createInvoice(body);
  }

  @Get("invoices/:id")
  invoice(@Param("id") id: string) {
    return this.financials.getInvoice(id);
  }

  @Patch("invoices/:id")
  updateInvoice(@Param("id") id: string, @Body() body: UpdateInvoiceDto) {
    return this.financials.updateInvoice(id, body);
  }

  @Delete("invoices/:id")
  deleteInvoice(@Param("id") id: string) {
    return this.financials.deleteInvoice(id);
  }

  @Post("invoices/:id/send")
  sendInvoice(@Param("id") id: string, @Body() body: SendInvoiceDto) {
    return this.financials.sendInvoice(id, body);
  }

  @Post("invoices/:id/void")
  voidInvoice(@Param("id") id: string) {
    return this.financials.voidInvoice(id);
  }

  @Patch("invoices/:id/external-invoice")
  linkExternalInvoice(
    @Param("id") id: string,
    @Body() body: ExternalInvoiceDto,
  ) {
    return this.financials.linkExternalInvoice(id, body);
  }
}

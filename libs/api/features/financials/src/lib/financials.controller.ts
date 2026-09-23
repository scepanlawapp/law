import {
  Body,
  Controller,
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
  BillingEntryListQueryDto,
  CandidateQueryDto,
  CreateBillingEntryDto,
  CreatePaymentDto,
  CreatePriceSourceDto,
  CreateStatementDto,
  ExternalInvoiceDto,
  AppendPriceSourceVersionDto,
  SendStatementDto,
  UpdateBillingEntryDto,
  UpdateStatementDto,
} from "./financials.dto";
import { FinancialsService } from "./financials.service";

@Controller("financials")
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess()
export class FinancialsController {
  constructor(private readonly financials: FinancialsService) {}

  @Get("overview")
  overview() {
    return this.financials.overview();
  }

  @Get("candidates")
  candidates(@Query() query: CandidateQueryDto) {
    return this.financials.listCandidates(query);
  }

  @Post("candidates/:candidateKey/dismiss")
  dismiss(@Param("candidateKey") candidateKey: string) {
    return this.financials.reviewCandidate(candidateKey, "DISMISSED");
  }

  @Post("candidates/:candidateKey/reopen")
  reopen(@Param("candidateKey") candidateKey: string) {
    return this.financials.reviewCandidate(candidateKey, "PENDING");
  }

  @Post("candidates/:candidateKey/record")
  recordCandidate(
    @Param("candidateKey") candidateKey: string,
    @Body("billingEntryId") billingEntryId: string,
  ) {
    return this.financials.recordCandidate(candidateKey, billingEntryId);
  }

  @Get("entries")
  entries(@Query() query: BillingEntryListQueryDto) {
    return this.financials.listEntries(query);
  }

  @Post("entries")
  createEntry(@Body() body: CreateBillingEntryDto) {
    return this.financials.createEntry(body);
  }

  @Get("entries/:id")
  entry(@Param("id") id: string) {
    return this.financials.getEntry(id);
  }

  @Patch("entries/:id")
  updateEntry(@Param("id") id: string, @Body() body: UpdateBillingEntryDto) {
    return this.financials.updateEntry(id, body);
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

  @Post("statements/:id/payments")
  addPayment(@Param("id") id: string, @Body() body: CreatePaymentDto) {
    return this.financials.addPayment(id, body);
  }

  @Get("clients/:clientId/account")
  clientAccount(@Param("clientId") clientId: string) {
    return this.financials.clientAccount(clientId);
  }
}

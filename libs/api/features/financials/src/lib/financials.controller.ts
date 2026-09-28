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
  BillingStatementLineListQueryDto,
  CancelBillingStatementLineDto,
  CandidateQueryDto,
  CreateBillingStatementLineDto,
  CreatePaymentDto,
  CreatePriceSourceDto,
  CreateStatementDto,
  ExternalInvoiceDto,
  AppendPriceSourceVersionDto,
  RecordBillingStatementLinesDto,
  ReviewBillingSuggestionsDto,
  SendStatementDto,
  UpdateBillingStatementLineDto,
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

  @Post("candidates/dismiss")
  dismissMany(@Body() body: ReviewBillingSuggestionsDto) {
    return this.financials.reviewCandidates(body.candidateKeys, "DISMISSED");
  }

  @Post("candidates/reopen")
  reopenMany(@Body() body: ReviewBillingSuggestionsDto) {
    return this.financials.reviewCandidates(body.candidateKeys, "PENDING");
  }

  @Post("candidates/record")
  recordMany(@Body() body: RecordBillingStatementLinesDto) {
    return this.financials.recordCandidatesAsLines(body);
  }

  @Post("candidates/:candidateKey/dismiss")
  dismiss(@Param("candidateKey") candidateKey: string) {
    return this.financials.reviewCandidate(candidateKey, "DISMISSED");
  }

  @Post("candidates/:candidateKey/reopen")
  reopen(@Param("candidateKey") candidateKey: string) {
    return this.financials.reviewCandidate(candidateKey, "PENDING");
  }

  @Get("lines")
  lines(@Query() query: BillingStatementLineListQueryDto) {
    return this.financials.listLines(query);
  }

  @Post("lines")
  createLine(@Body() body: CreateBillingStatementLineDto) {
    return this.financials.createLine(body);
  }

  @Get("lines/:id")
  line(@Param("id") id: string) {
    return this.financials.getLine(id);
  }

  @Patch("lines/:id")
  updateLine(
    @Param("id") id: string,
    @Body() body: UpdateBillingStatementLineDto,
  ) {
    return this.financials.updateLine(id, body);
  }

  @Post("lines/:id/cancel")
  cancelLine(
    @Param("id") id: string,
    @Body() body: CancelBillingStatementLineDto,
  ) {
    return this.financials.cancelLine(id, body.reason);
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

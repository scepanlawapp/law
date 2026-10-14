import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import { WorkspaceAccess, WorkspaceAccessGuard } from "@law/core";
import {
  PaymentQueryDto,
  SavePaymentDto,
  VoidPaymentDto,
} from "./payments.dto";
import { PaymentsService } from "./payments.service";
@Controller("financials/payments")
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}
  @Get() list(@Query() q: PaymentQueryDto) {
    return this.payments.list(q);
  }
  @Get("options") options() {
    return this.payments.options();
  }
  @Get("summary") summary(@Query() q: PaymentQueryDto) {
    return this.payments.summary(q);
  }
  @Get("collections") collections(@Query("clientId") clientId?: string) {
    return this.payments.collections(clientId);
  }
  @Get("eligible-invoices") eligible(
    @Query("clientId") clientId: string,
    @Query("currency") currency: string,
    @Query("paymentId") paymentId?: string,
  ) {
    return this.payments.eligible(clientId, currency, paymentId);
  }
  @Get("invoice/:id/collection") collection(@Param("id") id: string) {
    return this.payments.collection(id);
  }
  @Get("invoice/:id/history") history(@Param("id") id: string) {
    return this.payments.invoiceHistory(id);
  }
  @Get(":id") detail(@Param("id") id: string) {
    return this.payments.detail(id);
  }
  @Post() create(
    @Body() body: SavePaymentDto,
    @Headers("idempotency-key") key: string,
  ) {
    return this.payments.save(null, body, key);
  }
  @Patch(":id") update(
    @Param("id") id: string,
    @Body() body: SavePaymentDto,
    @Headers("idempotency-key") key: string,
  ) {
    return this.payments.save(id, body, key);
  }
  @Post(":id/void") void(
    @Param("id") id: string,
    @Body() body: VoidPaymentDto,
    @Headers("idempotency-key") key: string,
  ) {
    return this.payments.void(id, body, key);
  }
}

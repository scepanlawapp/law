import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import { WorkspaceAccess, WorkspaceAccessGuard } from "@law/core";
import { OrganizationSettingsService } from "./organization-settings.service";
import {
  BankAccountDto,
  CompanySettingsDto,
  CurrencySettingsDto,
  InvoiceDefaultsSettingsDto,
  InvoiceNumberingSettingsDto,
  PaymentSettingsDto,
  SefApiKeyDto,
  SefAttachmentSettingsDto,
  SefSettingsDto,
  TaxSettingsDto,
} from "./organization-settings.dto";

@Controller("organization-settings")
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess()
export class OrganizationSettingsController {
  constructor(private readonly settings: OrganizationSettingsService) {}

  @Get() get() {
    return this.settings.get();
  }
  @Put("company") company(@Body() body: CompanySettingsDto) {
    return this.settings.updateCompany(body);
  }
  @Put("tax") tax(@Body() body: TaxSettingsDto) {
    return this.settings.updateTax(body);
  }
  @Put("sef") sef(@Body() body: SefSettingsDto) {
    return this.settings.updateSef(body);
  }
  @Put("sef/api-key") apiKey(@Body() body: SefApiKeyDto) {
    return this.settings.replaceSefApiKey(body.apiKey);
  }
  @Delete("sef/api-key") removeApiKey() {
    return this.settings.removeSefApiKey();
  }
  @Put("invoice-numbering") numbering(
    @Body() body: InvoiceNumberingSettingsDto,
  ) {
    return this.settings.updateInvoiceNumbering(body);
  }
  @Put("payment") payment(@Body() body: PaymentSettingsDto) {
    return this.settings.updatePayment(body);
  }
  @Put("currency") currency(@Body() body: CurrencySettingsDto) {
    return this.settings.updateCurrency(body);
  }
  @Put("invoice-defaults") invoiceDefaults(
    @Body() body: InvoiceDefaultsSettingsDto,
  ) {
    return this.settings.updateInvoiceDefaults(body);
  }
  @Put("sef-attachments") sefAttachments(
    @Body() body: SefAttachmentSettingsDto,
  ) {
    return this.settings.updateSefAttachments(body);
  }
  @Post("bank-accounts") createAccount(@Body() body: BankAccountDto) {
    return this.settings.createBankAccount(body);
  }
  @Put("bank-accounts/:id") updateAccount(
    @Param("id") id: string,
    @Body() body: BankAccountDto,
  ) {
    return this.settings.updateBankAccount(id, body);
  }
  @Delete("bank-accounts/:id") archiveAccount(@Param("id") id: string) {
    return this.settings.archiveBankAccount(id);
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { OrganizationSettings } from "@law/api-interfaces";
import { PlatformPrismaService, WorkspaceContextService } from "@law/core";
import { InvoiceNumberingService } from "./invoice-numbering.service";
import {
  BankAccountDto,
  CompanySettingsDto,
  CurrencySettingsDto,
  InvoiceDefaultsSettingsDto,
  InvoiceNumberingSettingsDto,
  OtherOrganizationSettingsDto,
  InvoicePaymentQrSettingsDto,
  PaymentSettingsDto,
  SefAttachmentSettingsDto,
  SefSettingsDto,
  TaxSettingsDto,
} from "./organization-settings.dto";

@Injectable()
export class OrganizationSettingsService {
  constructor(
    private readonly db: PlatformPrismaService,
    private readonly config: ConfigService,
    private readonly numbering: InvoiceNumberingService,
  ) {}

  private get workspaceId(): string {
    return WorkspaceContextService.required.workspaceId;
  }

  private defaults() {
    return {
      workspaceId: this.workspaceId,
      availableVatRates: [0, 10, 20] as Prisma.InputJsonValue,
      allowedCurrencyCodes: ["RSD"] as Prisma.InputJsonValue,
      allowedSefAttachmentFileExtensions: [] as Prisma.InputJsonValue,
    };
  }

  private async record() {
    return this.db.organizationSettings.upsert({
      where: { workspaceId: this.workspaceId },
      create: this.defaults(),
      update: {},
    });
  }

  async get(): Promise<OrganizationSettings> {
    const [settings, bankAccounts] = await Promise.all([
      this.record(),
      this.db.bankAccount.findMany({
        where: { workspaceId: this.workspaceId },
        orderBy: [{ active: "desc" }, { isDefault: "desc" }, { name: "asc" }],
      }),
    ]);
    return {
      company: pick(settings, [
        "legalName",
        "displayName",
        "taxId",
        "registrationNumber",
        "addressLine1",
        "addressLine2",
        "city",
        "postalCode",
        "countryCode",
        "email",
        "phone",
        "website",
        "jbkjs",
      ]),
      tax: {
        vatRegistered: settings.vatRegistered,
        defaultVatRate:
          settings.defaultVatRate === null
            ? null
            : Number(settings.defaultVatRate),
        availableVatRates: numberArray(settings.availableVatRates),
        defaultTaxCategoryCode: settings.defaultTaxCategoryCode,
        defaultTaxExemptionReasonCode: settings.defaultTaxExemptionReasonCode,
        defaultTaxExemptionReasonText: settings.defaultTaxExemptionReasonText,
        cashAccountingEnabled: settings.cashAccountingEnabled,
      },
      sef: {
        enabled: settings.sefEnabled,
        environment: settings.sefEnvironment,
        hasApiKey: Boolean(settings.sefApiKeyCiphertext),
        maskedApiKey: settings.sefApiKeyCiphertext ? "••••••••••••" : null,
      },
      other: { caseNumberPattern: settings.caseNumberPattern },
      invoiceNumbering: {
        pattern: settings.invoiceNumberPattern,
        startingSequence: settings.invoiceNumberStartingSequence,
        incrementBy: settings.invoiceNumberIncrementBy,
        resetPolicy: settings.invoiceNumberResetPolicy,
        allowManualOverride: settings.invoiceNumberAllowManualOverride,
      },
      payment: {
        defaultPaymentTermDays: settings.defaultPaymentTermDays,
        defaultPaymentMethod: settings.defaultPaymentMethod,
        defaultPaymentModel: settings.defaultPaymentModel,
        paymentReferencePattern: settings.paymentReferencePattern,
      },
      currency: {
        defaultCurrencyCode: settings.defaultCurrencyCode,
        allowedCurrencyCodes: stringArray(settings.allowedCurrencyCodes),
        exchangeRateSource: settings.exchangeRateSource,
        allowManualExchangeRate: settings.allowManualExchangeRate,
        exchangeRatePrecision: settings.exchangeRatePrecision,
        amountPrecision: settings.amountPrecision,
      },
      invoiceDefaults: pick(settings, [
        "defaultIssuePlace",
        "defaultLanguage",
        "defaultUnitOfMeasure",
        "defaultNote",
        "defaultFooterText",
      ]),
      paymentQr: {
        enabled: settings.paymentQrEnabled,
        paymentStandard: settings.paymentQrStandard,
        paymentAccountId: settings.paymentQrAccountId,
        paymentPurposeTemplate: settings.paymentQrPurposeTemplate,
        referenceModel:
          settings.paymentQrReferenceModel === "00" ||
          settings.paymentQrReferenceModel === "97"
            ? settings.paymentQrReferenceModel
            : null,
        referenceTemplate: settings.paymentQrReferenceTemplate,
      },
      sefAttachments: {
        includeGeneratedInvoicePdf: settings.includeGeneratedInvoicePdf,
        includeUserAttachments: settings.includeUserAttachments,
        allowedFileExtensions: stringArray(
          settings.allowedSefAttachmentFileExtensions,
        ),
        maxAttachmentCount: settings.maxSefAttachmentCount,
        maxSingleFileSizeMb: settings.maxSefSingleFileSizeMb,
      },
      bankAccounts: bankAccounts.map(
        ({
          workspaceId: _workspaceId,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          ...account
        }) => account,
      ),
    };
  }

  async updateCompany(input: CompanySettingsDto) {
    if (input.countryCode === "RS") {
      if (input.taxId && !/^\d{9}$/.test(input.taxId))
        throw new BadRequestException(
          "Serbian PIB must contain exactly 9 digits",
        );
      if (input.registrationNumber && !/^\d{8}$/.test(input.registrationNumber))
        throw new BadRequestException(
          "Serbian registration number must contain exactly 8 digits",
        );
    }
    await this.upsert({ ...input });
    return (await this.get()).company;
  }

  async updateTax(input: TaxSettingsDto) {
    const rates = [...new Set(input.availableVatRates)].sort((a, b) => a - b);
    if (
      input.defaultVatRate !== null &&
      input.defaultVatRate !== undefined &&
      !rates.includes(input.defaultVatRate)
    )
      throw new BadRequestException(
        "Default VAT rate must be one of the available VAT rates",
      );
    await this.upsert({
      ...input,
      availableVatRates: rates as Prisma.InputJsonValue,
    });
    return (await this.get()).tax;
  }

  async updateSef(input: SefSettingsDto) {
    await this.upsert({
      sefEnabled: input.enabled,
      sefEnvironment: input.environment,
    });
    return (await this.get()).sef;
  }

  async replaceSefApiKey(apiKey: string) {
    const keySource = this.config
      .get<string>("ORGANIZATION_SECRETS_KEY")
      ?.trim();
    if (!keySource || keySource.length < 32)
      throw new BadRequestException(
        "ORGANIZATION_SECRETS_KEY must be configured with at least 32 characters",
      );
    const iv = randomBytes(12);
    const key = createHash("sha256").update(keySource).digest();
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(apiKey.trim(), "utf8"),
      cipher.final(),
    ]);
    await this.upsert({
      sefApiKeyCiphertext: ciphertext.toString("base64"),
      sefApiKeyIv: iv.toString("base64"),
      sefApiKeyAuthTag: cipher.getAuthTag().toString("base64"),
    });
    return (await this.get()).sef;
  }

  async removeSefApiKey() {
    await this.upsert({
      sefApiKeyCiphertext: null,
      sefApiKeyIv: null,
      sefApiKeyAuthTag: null,
    });
    return (await this.get()).sef;
  }

  async updateInvoiceNumbering(input: InvoiceNumberingSettingsDto) {
    this.numbering.validatePattern(input.pattern);
    await this.upsert({
      invoiceNumberPattern: input.pattern,
      invoiceNumberStartingSequence: input.startingSequence,
      invoiceNumberIncrementBy: input.incrementBy,
      invoiceNumberResetPolicy: input.resetPolicy,
      invoiceNumberAllowManualOverride: input.allowManualOverride,
    });
    return (await this.get()).invoiceNumbering;
  }

  async updateOther(input: OtherOrganizationSettingsDto) {
    this.numbering.validatePattern(input.caseNumberPattern);
    const example = this.numbering.renderPattern(
      input.caseNumberPattern,
      new Date(),
      999999999999,
    );
    if (example.length > 40 || !/^[A-Za-z0-9/.-]+$/.test(example)) {
      throw new BadRequestException(
        "Case numbers must fit 40 characters and contain only letters, digits, slash, dot or hyphen",
      );
    }
    await this.upsert({ caseNumberPattern: input.caseNumberPattern });
    return (await this.get()).other;
  }

  async updatePayment(input: PaymentSettingsDto) {
    await this.upsert({ ...input });
    return (await this.get()).payment;
  }

  async updateCurrency(input: CurrencySettingsDto) {
    const allowed = [
      ...new Set(input.allowedCurrencyCodes.map((code) => code.toUpperCase())),
    ];
    if (!allowed.includes(input.defaultCurrencyCode.toUpperCase()))
      throw new BadRequestException(
        "Default currency must be one of the allowed currencies",
      );
    await this.upsert({
      ...input,
      defaultCurrencyCode: input.defaultCurrencyCode.toUpperCase(),
      allowedCurrencyCodes: allowed as Prisma.InputJsonValue,
    });
    return (await this.get()).currency;
  }

  async updateInvoiceDefaults(input: InvoiceDefaultsSettingsDto) {
    await this.upsert({ ...input });
    return (await this.get()).invoiceDefaults;
  }

  async updatePaymentQr(input: InvoicePaymentQrSettingsDto) {
    const referenceModel = input.referenceModel?.trim() || null;
    const referenceTemplate = input.referenceTemplate?.trim() || null;
    if (Boolean(referenceModel) !== Boolean(referenceTemplate))
      throw new BadRequestException(
        "Payment reference model and template must be configured together",
      );

    if (input.enabled) {
      const settings = await this.record();
      if (!(settings.legalName?.trim() || settings.displayName?.trim()))
        throw new BadRequestException(
          "Company name is required for payment QR codes",
        );
      if (!input.paymentAccountId)
        throw new BadRequestException(
          "A payment account is required for payment QR codes",
        );
      const account = await this.db.bankAccount.findFirst({
        where: {
          id: input.paymentAccountId,
          workspaceId: this.workspaceId,
          active: true,
        },
      });
      if (!account)
        throw new BadRequestException(
          "Selected payment account is unavailable",
        );
      if (account.currencyCode !== "RSD")
        throw new BadRequestException(
          "NBS IPS payment QR requires an RSD account",
        );
      if (!normalizeSerbianAccountNumber(account.accountNumber))
        throw new BadRequestException(
          "NBS IPS payment QR requires a valid Serbian domestic account number",
        );
      if (!input.paymentPurposeTemplate.trim())
        throw new BadRequestException(
          "Payment purpose template is required for payment QR codes",
        );
    }

    await this.upsert({
      paymentQrEnabled: input.enabled,
      paymentQrStandard: input.paymentStandard,
      paymentQrAccountId: input.paymentAccountId || null,
      paymentQrPurposeTemplate: input.paymentPurposeTemplate.trim(),
      paymentQrReferenceModel: referenceModel,
      paymentQrReferenceTemplate: referenceTemplate,
    });
    return (await this.get()).paymentQr;
  }

  async updateSefAttachments(input: SefAttachmentSettingsDto) {
    await this.upsert({
      includeGeneratedInvoicePdf: input.includeGeneratedInvoicePdf,
      includeUserAttachments: input.includeUserAttachments,
      allowedSefAttachmentFileExtensions: input.allowedFileExtensions.map(
        (item) => item.replace(/^\./, "").toLowerCase(),
      ) as Prisma.InputJsonValue,
      maxSefAttachmentCount: input.maxAttachmentCount,
      maxSefSingleFileSizeMb: input.maxSingleFileSizeMb,
    });
    return (await this.get()).sefAttachments;
  }

  async createBankAccount(input: BankAccountDto) {
    return this.db.$transaction(async (tx) => {
      if (input.isDefault && input.active)
        await tx.bankAccount.updateMany({
          where: { workspaceId: this.workspaceId },
          data: { isDefault: false },
        });
      return tx.bankAccount.create({
        data: {
          ...input,
          workspaceId: this.workspaceId,
          currencyCode: input.currencyCode.toUpperCase(),
          isDefault: input.active && input.isDefault,
        },
      });
    });
  }

  async updateBankAccount(id: string, input: BankAccountDto) {
    const existing = await this.db.bankAccount.findFirst({
      where: { id, workspaceId: this.workspaceId },
    });
    if (!existing) throw new NotFoundException("Bank account not found");
    return this.db.$transaction(async (tx) => {
      if (input.isDefault && input.active)
        await tx.bankAccount.updateMany({
          where: { workspaceId: this.workspaceId, id: { not: id } },
          data: { isDefault: false },
        });
      return tx.bankAccount.update({
        where: { id },
        data: {
          ...input,
          currencyCode: input.currencyCode.toUpperCase(),
          isDefault: input.active && input.isDefault,
        },
      });
    });
  }

  async archiveBankAccount(id: string) {
    const result = await this.db.bankAccount.updateMany({
      where: { id, workspaceId: this.workspaceId },
      data: { active: false, isDefault: false },
    });
    if (!result.count) throw new NotFoundException("Bank account not found");
    return { archived: true };
  }

  private async upsert(data: Record<string, unknown>): Promise<void> {
    await this.db.organizationSettings.upsert({
      where: { workspaceId: this.workspaceId },
      create: { ...this.defaults(), ...data } as never,
      update: data as never,
    });
  }
}

function pick<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Pick<T, K> {
  return Object.fromEntries(keys.map((key) => [key, value[key]])) as Pick<T, K>;
}
function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number")
    : [];
}

function normalizeSerbianAccountNumber(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{18}$/.test(trimmed)) return trimmed;

  const formatted = /^(\d{3})-(\d{1,13})-(\d{2})$/.exec(trimmed);
  if (!formatted) return null;
  return `${formatted[1]}${formatted[2].padStart(13, "0")}${formatted[3]}`;
}

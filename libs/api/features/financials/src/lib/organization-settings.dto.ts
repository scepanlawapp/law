import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

const nullableString = () => IsOptional();

export class CompanySettingsDto {
  @nullableString() @IsString() @MaxLength(200) legalName?: string | null;
  @nullableString() @IsString() @MaxLength(200) displayName?: string | null;
  @nullableString() @IsString() @MaxLength(20) taxId?: string | null;
  @nullableString() @IsString() @MaxLength(20) registrationNumber?:
    | string
    | null;
  @nullableString() @IsString() @MaxLength(200) addressLine1?: string | null;
  @nullableString() @IsString() @MaxLength(200) addressLine2?: string | null;
  @nullableString() @IsString() @MaxLength(100) city?: string | null;
  @nullableString() @IsString() @MaxLength(20) postalCode?: string | null;
  @IsString() @Matches(/^[A-Z]{2}$/) countryCode!: string;
  @nullableString() @IsEmail() @MaxLength(254) email?: string | null;
  @nullableString() @IsString() @MaxLength(50) phone?: string | null;
  @nullableString()
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @MaxLength(500)
  website?: string | null;
  @nullableString() @IsString() @MaxLength(20) jbkjs?: string | null;
}

export class TaxSettingsDto {
  @IsBoolean() vatRegistered!: boolean;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultVatRate?: number | null;
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(30)
  @Type(() => Number)
  @IsNumber({}, { each: true })
  @Min(0, { each: true })
  @Max(100, { each: true })
  availableVatRates!: number[];
  @IsOptional() @IsString() @MaxLength(50) defaultTaxCategoryCode?:
    | string
    | null;
  @IsOptional() @IsString() @MaxLength(50) defaultTaxExemptionReasonCode?:
    | string
    | null;
  @IsOptional() @IsString() @MaxLength(500) defaultTaxExemptionReasonText?:
    | string
    | null;
  @IsBoolean() cashAccountingEnabled!: boolean;
}

export class SefSettingsDto {
  @IsBoolean() enabled!: boolean;
  @IsIn(["DEMO", "PRODUCTION"]) environment!: "DEMO" | "PRODUCTION";
}

export class SefApiKeyDto {
  @IsString() @MaxLength(4096) @Matches(/\S/) apiKey!: string;
}

export class OtherOrganizationSettingsDto {
  @IsString() @MaxLength(120) caseNumberPattern!: string;
}

export class InvoiceNumberingSettingsDto {
  @IsString() @MaxLength(120) pattern!: string;
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  startingSequence!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) incrementBy!: number;
  @IsIn(["NEVER", "YEARLY", "MONTHLY"]) resetPolicy!:
    | "NEVER"
    | "YEARLY"
    | "MONTHLY";
  @IsBoolean() allowManualOverride!: boolean;
}

export class PaymentSettingsDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  defaultPaymentTermDays!: number;
  @IsIn(["BANK_TRANSFER", "CASH", "CARD", "OTHER"]) defaultPaymentMethod!:
    | "BANK_TRANSFER"
    | "CASH"
    | "CARD"
    | "OTHER";
  @IsOptional() @IsString() @MaxLength(20) defaultPaymentModel?: string | null;
  @IsOptional() @IsString() @MaxLength(200) paymentReferencePattern?:
    | string
    | null;
}

export class CurrencySettingsDto {
  @Matches(/^[A-Z]{3}$/) defaultCurrencyCode!: string;
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(30)
  @Matches(/^[A-Z]{3}$/, { each: true })
  allowedCurrencyCodes!: string[];
  @IsIn(["NBS_MIDDLE", "NBS_BUY", "NBS_SELL", "MANUAL"]) exchangeRateSource!:
    | "NBS_MIDDLE"
    | "NBS_BUY"
    | "NBS_SELL"
    | "MANUAL";
  @IsBoolean() allowManualExchangeRate!: boolean;
  @Type(() => Number) @IsInt() @Min(0) @Max(12) exchangeRatePrecision!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(6) amountPrecision!: number;
}

export class InvoiceDefaultsSettingsDto {
  @IsOptional() @IsString() @MaxLength(100) defaultIssuePlace?: string | null;
  @IsString() @MaxLength(35) defaultLanguage!: string;
  @IsOptional() @IsString() @MaxLength(50) defaultUnitOfMeasure?: string | null;
  @IsOptional() @IsString() @MaxLength(10_000) defaultNote?: string | null;
  @IsOptional() @IsString() @MaxLength(10_000) defaultFooterText?:
    | string
    | null;
}

export class InvoicePaymentQrSettingsDto {
  @IsBoolean() enabled!: boolean;
  @IsIn(["NBS_IPS"]) paymentStandard!: "NBS_IPS";
  @IsOptional() @IsString() paymentAccountId?: string | null;
  @IsString() @MaxLength(200) paymentPurposeTemplate!: string;
  @IsOptional() @Matches(/^(00|97)$/) referenceModel?: string | null;
  @IsOptional() @IsString() @MaxLength(200) referenceTemplate?: string | null;
}

export class SefAttachmentSettingsDto {
  @IsBoolean() includeGeneratedInvoicePdf!: boolean;
  @IsBoolean() includeUserAttachments!: boolean;
  @IsArray()
  @ArrayMaxSize(50)
  @Matches(/^\.?[a-z0-9]{1,12}$/i, { each: true })
  allowedFileExtensions!: string[];
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  maxAttachmentCount?: number | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  maxSingleFileSizeMb?: number | null;
}

export class BankAccountDto {
  @IsString() @MaxLength(120) @Matches(/\S/) name!: string;
  @IsOptional() @IsString() @MaxLength(120) bankName?: string | null;
  @IsOptional() @IsString() @MaxLength(50) accountNumber?: string | null;
  @IsOptional() @IsString() @MaxLength(34) iban?: string | null;
  @IsOptional() @IsString() @MaxLength(11) swiftBic?: string | null;
  @Matches(/^[A-Z]{3}$/) currencyCode!: string;
  @IsBoolean() isDefault!: boolean;
  @IsBoolean() active!: boolean;
}

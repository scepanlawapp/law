import { Transform, Type } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from "class-validator";
import { PaginationQueryDto } from "@law/core";
import {
  BillingDisposition,
  BillingEntryKind,
  BillingEntryLifecycle,
  PriceSourceScope,
} from "@prisma/client";

const toArray = ({ value }: { value: unknown }): string[] | undefined =>
  value === undefined
    ? undefined
    : Array.isArray(value)
      ? value
      : [value as string];

export class FinancialDateQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsUUID("4", { each: true })
  clientIds?: string[];

  @IsOptional()
  @IsUUID()
  caseId?: string;

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsUUID("4", { each: true })
  caseIds?: string[];

  @IsOptional()
  @IsUUID()
  performerId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class BillingEntryListQueryDto extends FinancialDateQueryDto {
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  sourceTypes?: string[];

  @IsOptional()
  @IsEnum(BillingEntryKind)
  kind?: BillingEntryKind;

  @IsOptional()
  @IsEnum(BillingDisposition)
  disposition?: BillingDisposition;

  @IsOptional()
  @IsEnum(BillingEntryLifecycle)
  lifecycle?: BillingEntryLifecycle;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class CreateBillingEntryDto {
  @IsUUID()
  clientId!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  caseIds?: string[];

  @IsOptional()
  @IsUUID()
  performedByUserId?: string;

  @IsDateString()
  workStartDate!: string;

  @IsDateString()
  workEndDate!: string;

  @IsEnum(BillingEntryKind)
  kind!: BillingEntryKind;

  @IsOptional()
  @IsEnum(BillingDisposition)
  disposition?: BillingDisposition;

  @MinLength(1)
  @IsString()
  description!: string;

  @MinLength(1)
  @IsString()
  clientDescription!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  billedDurationMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  expenseCostAmount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  noChargeReason?: string;

  @IsOptional()
  @IsUUID()
  priceSourceVersionId?: string;

  @IsOptional()
  @IsString()
  priceSourceExcerpt?: string;

  @IsOptional()
  @IsString()
  sourceType?: string;

  @IsOptional()
  @IsString()
  sourceId?: string;
}

export class UpdateBillingEntryDto {
  @IsOptional()
  @IsEnum(BillingDisposition)
  disposition?: BillingDisposition;

  @IsOptional()
  @IsEnum(BillingEntryLifecycle)
  lifecycle?: BillingEntryLifecycle;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  clientDescription?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  expenseCostAmount?: number;

  @IsOptional()
  @IsString()
  noChargeReason?: string;
}

export class CreatePriceSourceDto {
  @IsEnum(PriceSourceScope)
  scope!: PriceSourceScope;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  caseId?: string;

  @MinLength(1)
  @IsString()
  title!: string;

  @IsString()
  @MinLength(1)
  rawText!: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @IsUUID()
  documentId?: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}

export class AppendPriceSourceVersionDto {
  @IsString()
  @MinLength(1)
  rawText!: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}

export class CreateStatementDto {
  @IsUUID()
  clientId!: string;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @IsString()
  currency!: string;

  @IsOptional()
  @IsUUID("4", { each: true })
  entryIds?: string[];

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class UpdateStatementDto {
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @IsOptional()
  @IsDateString()
  periodEnd?: string;

  @IsOptional()
  @IsUUID("4", { each: true })
  entryIds?: string[];
}

export class SendStatementDto {
  @IsOptional()
  @IsString()
  sharedMethod?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class ExternalInvoiceDto {
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class CreatePaymentDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsString()
  currency!: string;

  @IsDateString()
  paidDate!: string;

  @IsOptional()
  @IsString()
  externalReference?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class CandidateQueryDto extends FinancialDateQueryDto {
  @IsOptional()
  @IsString()
  sourceType?: string;

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  sourceTypes?: string[];

  @IsOptional()
  @IsIn(["PENDING", "RECORDED", "DISMISSED"])
  resolution?: "PENDING" | "RECORDED" | "DISMISSED";

  @IsOptional()
  @IsString()
  includeResolved?: string;
}

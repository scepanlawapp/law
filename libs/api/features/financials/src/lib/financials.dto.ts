import { Transform, Type } from "class-transformer";
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsISO8601,
  Length,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { PaginationQueryDto } from "@law/core";
import {
  RecordBillingStatementLineItemRequest,
  RecordBillingStatementLinesRequest,
  ReviewBillingSuggestionsRequest,
} from "@law/api-interfaces";
import { BillingStatementLineStatus, PriceSourceScope } from "@prisma/client";

export class ReviewBillingSuggestionsDto
  implements ReviewBillingSuggestionsRequest
{
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  candidateKeys!: string[];
}

export class RecordBillingStatementLineItemDto
  implements RecordBillingStatementLineItemRequest
{
  @IsString()
  @MinLength(1)
  candidateKey!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsString()
  @Length(3, 3)
  currency!: string;
}

export class RecordBillingStatementLinesDto
  implements RecordBillingStatementLinesRequest
{
  @IsUUID()
  clientId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecordBillingStatementLineItemDto)
  items!: RecordBillingStatementLineItemDto[];
}

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

export class BillingStatementLineListQueryDto extends FinancialDateQueryDto {
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  sourceTypes?: string[];

  @IsOptional()
  @IsEnum(BillingStatementLineStatus)
  status?: BillingStatementLineStatus;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class CreateBillingStatementLineDto {
  @IsUUID()
  clientId!: string;

  @IsOptional()
  @IsUUID()
  performedByUserId?: string;

  @IsOptional()
  @IsDateString()
  serviceDate?: string;

  @MinLength(1)
  @IsString()
  description!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsOptional()
  @IsString()
  sourceType?: string;

  @IsOptional()
  @IsString()
  sourceId?: string;
}

export class UpdateBillingStatementLineDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}

export class CancelBillingStatementLineDto {
  @IsString()
  @MinLength(1)
  reason!: string;
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
  lineIds?: string[];

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
  lineIds?: string[];
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

import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsBoolean,
  IsEnum,
  IsInt,
  IsIn,
  Length,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
  MaxLength,
} from "class-validator";
import { PriceSourceScope } from "@prisma/client";

export class InvoiceLineInputDto {
  /** Identity of an existing line being edited; never stored. */
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsDateString()
  serviceDate!: string;

  @MinLength(1)
  @IsString()
  description!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  netAmount!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  vatRate!: number;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  taxCategoryCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxExemptionReasonCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  taxExemptionReasonText?: string | null;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  vatAmount!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  grossAmount!: number;

  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  workEntryIds?: string[];

  @IsOptional()
  @IsBoolean()
  pricingRequired?: boolean;

  @IsOptional()
  @IsInt()
  minutes?: number;
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

export class CreateInvoiceDto {
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsUUID()
  clientId!: string;

  @IsDateString()
  dateOfCreate!: string;

  @IsDateString()
  dateOfMaturity!: string;

  @IsDateString()
  dateOfTurnover!: string;

  @IsString()
  placeOfIssue!: string;

  @IsString()
  methodOfPayment!: string;

  @IsString()
  comment!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  netAmount!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  vatRate!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  vatAmount!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  grossAmount!: number;

  @IsString()
  numberOfCashBill!: string;

  @IsString()
  country!: string;

  @IsString()
  currency!: string;

  @IsOptional()
  @IsIn(["3", "35", "432"])
  vatLiabilityTimingCode?: "3" | "35" | "432" | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineInputDto)
  lines!: InvoiceLineInputDto[];

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsBoolean()
  printWorkSpecification?: boolean;
}

export class UpdateInvoiceDto {
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsDateString()
  dateOfCreate?: string;

  @IsOptional()
  @IsDateString()
  dateOfMaturity?: string;

  @IsOptional()
  @IsDateString()
  dateOfTurnover?: string;

  @IsOptional()
  @IsString()
  placeOfIssue?: string;

  @IsOptional()
  @IsString()
  methodOfPayment?: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  netAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  vatRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  vatAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  grossAmount?: number;

  @IsOptional()
  @IsString()
  numberOfCashBill?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsIn(["3", "35", "432"])
  vatLiabilityTimingCode?: "3" | "35" | "432" | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineInputDto)
  lines?: InvoiceLineInputDto[];

  @IsOptional()
  @IsBoolean()
  printWorkSpecification?: boolean;
}

export class SendInvoiceDto {
  @IsOptional()
  @IsString()
  sharedMethod?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class SefInvoiceRequestDto {
  @IsOptional()
  @IsUUID()
  bankAccountId?: string;
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

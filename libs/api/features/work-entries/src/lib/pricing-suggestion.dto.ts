import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import type { PricingFacts, PricingSuggestionWork } from "@law/api-interfaces";

export class PricingFactsDto implements PricingFacts {
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,15}(\.\d{1,2})?$/)
  claimValue?: string;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) claimCurrency?: string;
  @IsOptional() @IsString() @MaxLength(500) proceedingType?: string;
  @IsOptional() @IsString() @MaxLength(500) legalAction?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000) representedParties?: number;
  @IsOptional() @IsInt() @Min(1) @Max(10000) quantity?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1440) hearingMinutes?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class PricingSuggestionWorkDto implements PricingSuggestionWork {
  @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) workDate!: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() caseId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1440) minutes?: number | null;
  @IsOptional() @IsUUID() serviceCategoryId?: string;
}

export class PricingSuggestionDto {
  @IsIn(["SAVED", "UNSAVED"]) kind!: "SAVED" | "UNSAVED";
  @ValidateIf((body: PricingSuggestionDto) => body.kind === "SAVED")
  @IsUUID()
  workEntryId?: string;
  @ValidateIf((body: PricingSuggestionDto) => body.kind === "UNSAVED")
  @IsObject()
  @ValidateNested()
  @Type(() => PricingSuggestionWorkDto)
  work?: PricingSuggestionWorkDto;
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PricingFactsDto)
  pricingFacts?: PricingFactsDto;
}

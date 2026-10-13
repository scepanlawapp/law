import { Type } from "class-transformer";
import {
  IsDefined,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  SUPPORTED_WORK_ENTRY_CURRENCIES,
  PriceSuggestionRequest,
  PriceSuggestionWorkEvent,
  WorkEntryTreatment,
} from "@law/api-interfaces";

export class PriceSuggestionWorkEventDto implements PriceSuggestionWorkEvent {
  @IsOptional() @IsUUID() id?: string;
  @IsOptional() @IsUUID() clientId?: string | null;
  @IsOptional() @IsUUID() caseId?: string;
  @IsOptional() @IsUUID() taskId?: string;
  @IsOptional() @IsUUID() eventId?: string;
  @IsOptional() @IsUUID() userId?: string | null;
  @IsOptional() @IsUUID() serviceCategoryId?: string;
  @IsISO8601({ strict: true }) @MaxLength(10) workDate!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(12000) description?: string;
  @IsOptional() @IsString() @MaxLength(12000) additionalInformation?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1440) minutes?: number | null;
  @IsOptional() @IsIn(SUPPORTED_WORK_ENTRY_CURRENCIES) currency?: string | null;
  @IsOptional()
  @IsIn(["RETAINER", "AT", "HOURLY", "NON_BILLABLE", "UNDECIDED"])
  treatment?: WorkEntryTreatment;
  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  @Max(1)
  taskCompletionFraction?: number;
}
export class PriceSuggestionDto implements PriceSuggestionRequest {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => PriceSuggestionWorkEventDto)
  workEvent!: PriceSuggestionWorkEventDto;
}

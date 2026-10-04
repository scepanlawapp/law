import { Transform } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";
import { PaginationQueryDto } from "@law/core";
import type {
  CreateWorkEntryRequest,
  StartTimerRequest,
  UpdateWorkEntryRequest,
  WorkEntryQuery,
  WorkEntryStatus,
  WorkEntryTreatment,
} from "@law/api-interfaces";

export const WORK_ENTRY_STATUSES = [
  "RUNNING",
  "PROPOSED",
  "CONFIRMED",
  "BILLED",
  "WRITTEN_OFF",
] as const;
export const WORK_ENTRY_TREATMENTS = [
  "RETAINER",
  "AT",
  "HOURLY",
  "NON_BILLABLE",
  "UNDECIDED",
] as const;

const toArray = ({ value }: { value: unknown }): string[] | undefined =>
  value === undefined
    ? undefined
    : Array.isArray(value)
      ? value
      : [value as string];

const toBoolean = ({ value }: { value: unknown }): boolean | undefined =>
  value === undefined ? undefined : value === true || value === "true";

export class CreateWorkEntryDto implements CreateWorkEntryRequest {
  @IsUUID()
  clientId!: string;

  @IsOptional()
  @IsUUID()
  caseId?: string;

  @IsISO8601()
  workDate!: string;

  @IsInt()
  @Min(1)
  @Max(1440)
  minutes!: number;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsUUID()
  serviceCategoryId?: string;

  @IsOptional()
  @IsIn(WORK_ENTRY_TREATMENTS)
  treatment?: WorkEntryTreatment;

  @IsOptional()
  @IsIn(["MANUAL", "QUICK_CAPTURE"])
  source?: "MANUAL" | "QUICK_CAPTURE";

  @IsOptional()
  @IsBoolean()
  aiParsed?: boolean;
}

export class UpdateWorkEntryDto implements UpdateWorkEntryRequest {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  caseId?: string;

  @IsOptional()
  @IsISO8601()
  workDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;

  @IsOptional()
  @IsUUID()
  serviceCategoryId?: string;

  @IsOptional()
  @IsIn(WORK_ENTRY_TREATMENTS)
  treatment?: WorkEntryTreatment;

  @IsOptional()
  @IsIn(["MANUAL", "QUICK_CAPTURE"])
  source?: "MANUAL" | "QUICK_CAPTURE";

  @IsOptional()
  @IsBoolean()
  aiParsed?: boolean;
}

export class ConfirmWorkEntryDto {
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes!: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class WriteOffWorkEntryDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class StartTimerDto implements StartTimerRequest {
  @IsUUID()
  clientId!: string;

  @IsOptional()
  @IsUUID()
  caseId?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class WorkEntryQueryDto
  extends PaginationQueryDto
  implements WorkEntryQuery
{
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsUUID("4", { each: true })
  userIds?: string[];

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
  @IsIn(WORK_ENTRY_STATUSES, { each: true })
  statuses?: WorkEntryStatus[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(WORK_ENTRY_TREATMENTS, { each: true })
  treatments?: WorkEntryTreatment[];

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  unbilledOnly?: boolean;
}

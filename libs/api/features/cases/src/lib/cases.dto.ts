import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from "class-validator";
import { PaginationQueryDto } from "@law/core";
import {
  CASE_NUMBER_FORMATS,
  CaseNumberFormat,
} from "@law/api-interfaces";
import { ActivityType, CasePriority, CaseStatus } from "@prisma/client";

export class CaseNumberSuggestionQueryDto {
  @IsOptional()
  @IsIn(CASE_NUMBER_FORMATS)
  format?: CaseNumberFormat;
}

export class CaseListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(CaseStatus) status?: CaseStatus;
  @IsOptional() @IsEnum(CasePriority) priority?: CasePriority;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() responsibleUserId?: string;
  @IsOptional() @IsUUID() caseTypeId?: string;
  @IsOptional() @IsUUID() practiceAreaId?: string;
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  @Type(() => String)
  tags?: string[];
}

export class CreateCaseDto {
  @IsUUID() clientId!: string;
  @IsString() @IsNotEmpty() @MaxLength(40) @Matches(/^[A-Za-z0-9/.-]+$/)
  caseNumber!: string;
  @IsString() @MaxLength(320) name!: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsUUID() caseTypeId?: string;
  @IsOptional() @IsUUID() practiceAreaId?: string;
  @IsOptional() @IsEnum(CaseStatus) status?: CaseStatus;
  @IsOptional() @IsEnum(CasePriority) priority?: CasePriority;
  @IsUUID() responsibleUserId!: string;
  @IsOptional() @IsDateString() openedDate?: string;
  @IsOptional() @IsString() @MaxLength(320) externalReference?: string;
  @IsOptional() @IsString() @MaxLength(160) confidentialityLevel?: string;
  @IsOptional() @IsArray() @IsUUID("4", { each: true }) tagIds?: string[];
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}

export class UpdateCaseDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(40) @Matches(/^[A-Za-z0-9/.-]+$/)
  caseNumber?: string;
  @IsOptional() @IsString() @MaxLength(320) name?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsUUID() caseTypeId?: string;
  @IsOptional() @IsUUID() practiceAreaId?: string;
  @IsOptional() @IsEnum(CaseStatus) status?: CaseStatus;
  @IsOptional() @IsEnum(CasePriority) priority?: CasePriority;
  @IsOptional() @IsDateString() openedDate?: string;
  @IsOptional() @IsString() @MaxLength(320) externalReference?: string;
  @IsOptional() @IsString() @MaxLength(160) confidentialityLevel?: string;
  @IsOptional() @IsArray() @IsUUID("4", { each: true }) tagIds?: string[];
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}

export class CloseCaseDto {
  @IsDateString() closedDate!: string;
  @IsOptional() @IsString() @MaxLength(10000) closingNote?: string;
}

export class CaseActivityDto {
  @IsEnum(ActivityType) type!: ActivityType;
  @IsString() @MaxLength(320) title!: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsDateString() activityDate!: string;
}

export class UpdateCaseActivityDto {
  @IsOptional() @IsEnum(ActivityType) type?: ActivityType;
  @IsOptional() @IsString() @MaxLength(320) title?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsDateString() activityDate?: string;
}

export class CaseResponsibilityDto {
  @IsUUID() userId!: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsDateString() startedAt?: string;
}

export class UpdateCaseResponsibilityDto {
  @IsOptional() @IsDateString() startedAt?: string;
}

import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { PaginationQueryDto } from "@law/core";
import {
  ActivityType,
  CasePriority,
  CaseStatus,
  ClientAddressType,
  ClientStatus,
  ClientType,
} from "@prisma/tenant-client";

export class ClientListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @IsOptional()
  @IsEnum(ClientType)
  type?: ClientType;

  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  @Type(() => String)
  tags?: string[];
}

export class ClientActivityListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(ActivityType) type?: ActivityType;
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeCaseActivities?: boolean;
}

export class ClientCaseListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(CaseStatus)
  status?: CaseStatus;

  @IsOptional()
  @IsEnum(CasePriority)
  priority?: CasePriority;
}

export class CreateClientDto {
  @IsEnum(ClientType)
  type!: ClientType;

  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  organizationName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  preferredLanguage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  notes?: string;

  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  tagIds?: string[];

  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
}

export class UpdateClientDto extends CreateClientDto {
  @IsOptional()
  declare type: ClientType;
}

export class ClientAddressDto {
  @IsOptional() @IsEnum(ClientAddressType) type?: ClientAddressType;
  @IsOptional() @IsString() @MaxLength(320) street?: string;
  @IsOptional() @IsString() @MaxLength(320) streetAdditional?: string;
  @IsOptional() @IsString() @MaxLength(160) city?: string;
  @IsOptional() @IsString() @MaxLength(40) postalCode?: string;
  @IsOptional() @IsString() @MaxLength(160) stateOrRegion?: string;
  @IsOptional() @IsString() @MaxLength(2) country?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class ClientContactDto {
  @IsString() @MaxLength(160) firstName!: string;
  @IsString() @MaxLength(160) lastName!: string;
  @IsOptional() @IsString() @MaxLength(160) position?: string;
  @IsOptional() @IsString() @MaxLength(320) email?: string;
  @IsOptional() @IsString() @MaxLength(80) phone?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsString() @MaxLength(10000) notes?: string;
}

export class UpdateClientContactDto {
  @IsOptional() @IsString() @MaxLength(160) firstName?: string;
  @IsOptional() @IsString() @MaxLength(160) lastName?: string;
  @IsOptional() @IsString() @MaxLength(160) position?: string;
  @IsOptional() @IsString() @MaxLength(320) email?: string;
  @IsOptional() @IsString() @MaxLength(80) phone?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsString() @MaxLength(10000) notes?: string;
}

export class ClientActivityDto {
  @IsEnum(ActivityType) type!: ActivityType;
  @IsString() @MaxLength(320) title!: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsDateString() activityDate!: string;
  @IsOptional() @IsUUID() relatedCaseId?: string;
}

export class UpdateClientActivityDto {
  @IsOptional() @IsEnum(ActivityType) type?: ActivityType;
  @IsOptional() @IsString() @MaxLength(320) title?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsDateString() activityDate?: string;
  @IsOptional() @IsUUID() relatedCaseId?: string;
}

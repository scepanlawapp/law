import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { PaginationQueryDto } from "@law/core";
import { MatterPriority, MatterStatus } from "@prisma/tenant-client";

export class MatterListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(MatterStatus) status?: MatterStatus;
  @IsOptional() @IsEnum(MatterPriority) priority?: MatterPriority;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() responsibleUserId?: string;
  @IsOptional() @IsUUID() practiceAreaId?: string;
  @IsOptional() @IsUUID() stageId?: string;
}

export class CreateMatterDto {
  @IsString() @MaxLength(320) title!: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsUUID() practiceAreaId?: string;
  @IsOptional() @IsUUID() stageId?: string;
  @IsOptional() @IsEnum(MatterPriority) priority?: MatterPriority;
  @IsOptional() @IsUUID() responsibleUserId?: string;
  @IsOptional() @IsDateString() openedAt?: string;
  @IsOptional() @IsArray() @IsUUID("4", { each: true }) clientIds?: string[];
  @IsOptional()
  @Type(() => String)
  @IsArray()
  @IsUUID("4", { each: true })
  participantIds?: string[];
}

export class UpdateMatterDto {
  @IsOptional() @IsString() @MaxLength(320) title?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsUUID() practiceAreaId?: string;
  @IsOptional() @IsUUID() stageId?: string;
  @IsOptional() @IsEnum(MatterPriority) priority?: MatterPriority;
  @IsOptional() @IsDateString() openedAt?: string;
  @IsOptional() @IsDateString() closedAt?: string;
}

export class OpenMatterDto {
  @IsOptional() @IsArray() @IsUUID("4", { each: true }) clientIds?: string[];
}

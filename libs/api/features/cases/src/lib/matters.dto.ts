import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { PaginationQueryDto } from "@law/core";

export class MatterListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(["DRAFT", "OPEN", "CLOSED"])
  state?: string;

  @IsOptional()
  @IsIn(["LOW", "NORMAL", "HIGH", "URGENT"])
  priority?: string;

  @IsOptional()
  @IsUUID()
  practiceAreaId?: string;

  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;
}

export class CreateMatterDto {
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsIn(["LOW", "NORMAL", "HIGH", "URGENT"])
  priority?: string;

  @IsOptional()
  @IsUUID()
  practiceAreaId?: string;

  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  clientIds?: string[];

  @IsOptional()
  @IsUUID()
  primaryClientId?: string;
}

export class UpdateMatterDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsIn(["LOW", "NORMAL", "HIGH", "URGENT"])
  priority?: string;

  @IsOptional()
  @IsUUID()
  practiceAreaId?: string | null;

  @IsOptional()
  @IsUUID()
  stageId?: string | null;

  @IsOptional()
  @IsUUID()
  responsibleUserId?: string | null;
}

export class MatterClientDto {
  @IsUUID()
  clientId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from "class-validator";
import { PaginationQueryDto } from "@law/core";

export const LOOKUP_KINDS = [
  "practice-areas",
  "matter-stages",
  "participant-roles",
  "proceeding-types",
  "document-categories",
  "organization-relationship-types",
] as const;

export type LookupKindParam = (typeof LOOKUP_KINDS)[number];

export class LegalLookupQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsBoolean()
  includeInactive?: boolean;

  @IsOptional()
  @IsUUID()
  practiceAreaId?: string;
}

export class LegalLookupCreateDto {
  @IsString()
  @MaxLength(100)
  code!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsUUID()
  practiceAreaId?: string;
}

export class LegalLookupUpdateDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsUUID()
  practiceAreaId?: string | null;
}

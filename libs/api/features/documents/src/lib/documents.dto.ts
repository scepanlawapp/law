import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsUUID,
  MaxLength,
} from "class-validator";
import { PaginationQueryDto } from "@law/core";

export class DocumentListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsBoolean()
  includeArchived?: boolean;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  matterId?: string;
}

export class DocumentMetadataDto {
  @IsOptional()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @MaxLength(40)
  documentDate?: string;

  @IsOptional()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsIn(["INTERNAL", "CLIENT_SHARED"])
  visibility?: "INTERNAL" | "CLIENT_SHARED";

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  matterId?: string;
}
